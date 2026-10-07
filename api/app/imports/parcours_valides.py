"""Parcours validés, versionnés dans le dépôt et chargés au démarrage de l'API (ADR 0025).

Chaque fichier .json du dossier api/validated_courses/ est un paquet en version 3 ou plus, qui
contient un parcours. Ce qui manque en base est créé et publié. Ce qui existe déjà (même
identifiant) n'est pas modifié : une base vidée retrouve ses parcours, une base en service garde
les siens.

À la main : uv run python -m app.imports.parcours_valides [dossier]
"""

import argparse
import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_config
from app.db import SessionLocale
from app.imports.conversion import lecon_en_markdown
from app.imports.format import BlocImage, Paquet
from app.imports.identite import erreurs_d_identite, erreurs_de_format
from app.imports.lecture import Erreur, lire_fichier
from app.lecons.modeles import Lecon, Revision, StatutRevision, Theme
from app.modeles import __all__ as _tous_les_modeles  # noqa: F401  (enregistre les tables)
from app.parcours.modeles import EtapeParcours, Parcours
from app.temps import maintenant

journal_technique = logging.getLogger(__name__)

# Plusieurs processus de l'API peuvent démarrer ensemble : un seul charge à la fois.
VERROU = 0x52454E41  # « RENA »

# Les thèmes de la plateforme : ils sont créés au démarrage, s'ils manquent.
NOMS_THEMES = {
    "python-bases": "Python - Bases",
    "python-poo": "Python - Programmation Orientée Objet",
    "python-django": "Python - Django",
    "python-fastapi": "Python - Suite FastAPI",
    "javascript": "JavaScript",
    "vba-bases": "VBA - Bases",
    "daggerheart": "JDR - DaggerHeart",
}


class FichierInvalide(Exception):
    def __init__(self, erreurs: list[Erreur]) -> None:
        super().__init__("; ".join(f"{e.emplacement} : {e.message}" for e in erreurs))
        self.erreurs = erreurs


@dataclass
class Bilan:
    lecons: int = 0
    parcours: int = 0


def erreurs_du_dossier(paquet: Paquet) -> list[Erreur]:
    """Règles propres aux parcours validés, en plus du format."""
    erreurs = erreurs_de_format(paquet)
    if paquet.version < 3:
        erreurs.append(Erreur("version", "Un parcours validé utilise la version 3 du format."))
    parcours = paquet.parcours
    if parcours is None:
        erreurs.append(Erreur("parcours", "Un parcours validé contient un parcours."))
    else:
        dans_le_paquet = {lecon.slug for lecon in paquet.lecons}
        for slug in parcours.lecons:
            if slug not in dans_le_paquet:
                erreurs.append(
                    Erreur(
                        f"Parcours « {parcours.slug} » › lecons",
                        f"La leçon « {slug} » doit être dans le fichier.",
                    )
                )
    for lecon in paquet.lecons:
        if any(isinstance(bloc, BlocImage) for bloc in lecon.blocs):
            erreurs.append(
                Erreur(f"Leçon « {lecon.slug} »", "Les images ne sont pas encore prises en charge.")
            )
    return erreurs


def lire_parcours_valide(chemin: Path) -> Paquet:
    """Lit et vérifie un fichier du dossier, sans la base. Lève FichierInvalide."""
    lu = lire_fichier(chemin.name, chemin.read_bytes())
    if lu.paquet is None:
        raise FichierInvalide(lu.erreurs)
    erreurs = erreurs_du_dossier(lu.paquet)
    if erreurs:
        raise FichierInvalide(erreurs)
    return lu.paquet


def lire_dossier(dossier: Path) -> list[tuple[str, Paquet | FichierInvalide]]:
    """Lit les fichiers du dossier, dans l'ordre de leur nom."""
    fichiers: list[tuple[str, Paquet | FichierInvalide]] = []
    for chemin in sorted(dossier.glob("*.json")):
        try:
            fichiers.append((chemin.name, lire_parcours_valide(chemin)))
        except FichierInvalide as erreur:
            fichiers.append((chemin.name, erreur))
    return fichiers


async def _theme(db: AsyncSession, slug: str) -> Theme:
    theme = await db.scalar(select(Theme).where(Theme.slug == slug))
    if theme is None:
        theme = Theme(slug=slug, nom=NOMS_THEMES.get(slug, slug.capitalize()))
        db.add(theme)
        await db.flush()
    return theme


async def creer_themes_par_defaut(db: AsyncSession) -> None:
    """Les thèmes par défaut existent toujours : on importe sans passer par l'admin."""
    for slug in NOMS_THEMES:
        await _theme(db, slug)


async def charger_paquet(db: AsyncSession, paquet: Paquet) -> Bilan:
    """Crée et publie les leçons et le parcours absents. Lève FichierInvalide."""
    erreurs = await erreurs_d_identite(db, paquet)
    if erreurs:
        raise FichierInvalide(erreurs)

    bilan = Bilan()
    assiste_par_ia = paquet.generation.assiste_par_ia if paquet.generation else False
    for importee in paquet.lecons:
        if importee.id is None:
            continue
        if await db.get(Lecon, importee.id) is not None:
            continue
        theme = await _theme(db, importee.theme)
        lecon = Lecon(id=importee.id, slug=importee.slug, theme_id=theme.id, niveau=importee.niveau)
        db.add(lecon)
        await db.flush()
        revision = Revision(
            lecon_id=lecon.id,
            numero=1,
            titre=importee.titre,
            resume=importee.resume,
            objectifs=importee.objectifs,
            duree_minutes=importee.duree_minutes,
            contenu=lecon_en_markdown(importee),
            statut=StatutRevision.PUBLIEE,
            assiste_par_ia=assiste_par_ia,
            publiee_le=maintenant(),
        )
        db.add(revision)
        await db.flush()
        lecon.revision_publiee_id = revision.id
        bilan.lecons += 1

    importe = paquet.parcours
    if importe and importe.id and not await db.get(Parcours, importe.id):
        theme = await _theme(db, importe.theme)
        ids = {lecon.slug: lecon.id for lecon in paquet.lecons if lecon.id}
        db.add(
            Parcours(
                id=importe.id,
                slug=importe.slug,
                titre=importe.titre,
                description=importe.description,
                niveau=importe.niveau,
                theme_id=theme.id,
                publie=True,
                etapes=[
                    EtapeParcours(lecon_id=ids[slug], position=position)
                    for position, slug in enumerate(importe.lecons, start=1)
                ],
            )
        )
        bilan.parcours += 1
    await db.flush()
    return bilan


async def charger_parcours_valides(db: AsyncSession, dossier: Path) -> Bilan:
    """Crée les thèmes par défaut, charge chaque fichier du dossier, et valide la transaction.

    Un fichier invalide est signalé dans les logs et ignoré : les autres sont chargés.
    """
    fichiers = await asyncio.to_thread(lire_dossier, dossier)
    await db.execute(text("SELECT pg_advisory_xact_lock(:verrou)"), {"verrou": VERROU})
    await creer_themes_par_defaut(db)
    total = Bilan()
    for nom, lu in fichiers:
        try:
            if isinstance(lu, FichierInvalide):
                raise lu
            async with db.begin_nested():
                bilan = await charger_paquet(db, lu)
        except FichierInvalide as erreur:
            journal_technique.error("Parcours validé ignoré, %s : %s", nom, erreur)
            continue
        total.lecons += bilan.lecons
        total.parcours += bilan.parcours
    await db.commit()
    if total.lecons or total.parcours:
        journal_technique.info(
            "Parcours validés : %d parcours et %d leçon(s) ajoutés.", total.parcours, total.lecons
        )
    return total


async def charger_au_demarrage() -> None:
    async with SessionLocale() as db:
        await charger_parcours_valides(db, get_config().dossier_parcours_valides)


def main() -> None:
    parseur = argparse.ArgumentParser(description=__doc__)
    parseur.add_argument("dossier", nargs="?", type=Path)
    dossier: Path = parseur.parse_args().dossier or get_config().dossier_parcours_valides

    async def lancer() -> Bilan:
        async with SessionLocale() as db:
            return await charger_parcours_valides(db, dossier)

    bilan = asyncio.run(lancer())
    print(f"{bilan.parcours} parcours et {bilan.lecons} leçon(s) ajoutés.")


if __name__ == "__main__":
    main()
