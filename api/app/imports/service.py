"""Analyse puis import d'un paquet de leçons (ADR 0019). C'est tout ou rien."""

import uuid
from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.journal import journaliser
from app.comptes.modeles import Utilisateur
from app.config import get_config
from app.imports.conversion import lecon_en_markdown
from app.imports.format import BlocCode, BlocExercice, BlocImage, LeconImportee, Paquet
from app.imports.lecture import Erreur, FichierLu, lire_fichier
from app.imports.modeles import Import
from app.lecons.modeles import Lecon, Revision, StatutRevision, Theme
from app.parcours.modeles import EtapeParcours, Parcours

Action = Literal["creation", "nouvelle_version"]


@dataclass
class ApercuLecon:
    slug: str
    titre: str
    theme: str
    action: Action
    nb_images: int


@dataclass
class ApercuParcours:
    slug: str
    titre: str
    action: Literal["creation", "mise_a_jour"]
    lecons: list[str]


@dataclass
class CodeAVerifier:
    """Exemple de code à exécuter dans le navigateur de la personne qui importe (ADR 0009)."""

    lecon: str
    bloc: int
    langage: Literal["python", "javascript"]
    code: str
    sortie_attendue: str | None
    # Vrai pour la solution d'un exercice : son code de départ n'est pas vérifié.
    solution: bool = False


@dataclass
class Analyse:
    fichier: FichierLu
    erreurs: list[Erreur] = field(default_factory=list)
    lecons: list[ApercuLecon] = field(default_factory=list)
    parcours: ApercuParcours | None = None
    codes: list[CodeAVerifier] = field(default_factory=list)

    @property
    def valide(self) -> bool:
        return self.fichier.paquet is not None and not self.erreurs


def _images_utilisees(lecon: LeconImportee) -> list[str]:
    return [bloc.fichier for bloc in lecon.blocs if isinstance(bloc, BlocImage)]


def _codes(lecon: LeconImportee) -> list[CodeAVerifier]:
    """Les blocs exécutables, ceux qui annoncent leur sortie et les solutions sont vérifiés.

    Le code de départ d'un exercice ne l'est pas : il est souvent incomplet, exprès.
    """
    codes: list[CodeAVerifier] = []
    for index, bloc in enumerate(lecon.blocs, start=1):
        if isinstance(bloc, BlocCode) and (bloc.executable or bloc.sortie_attendue is not None):
            codes.append(
                CodeAVerifier(lecon.slug, index, bloc.langage, bloc.code, bloc.sortie_attendue)
            )
        elif isinstance(bloc, BlocExercice):
            codes.append(
                CodeAVerifier(
                    lecon.slug, index, bloc.langage, bloc.solution, bloc.sortie_attendue, True
                )
            )
    return codes


async def analyser(db: AsyncSession, nom_fichier: str, contenu: bytes) -> Analyse:
    fichier = lire_fichier(nom_fichier, contenu)
    analyse = Analyse(fichier, erreurs=list(fichier.erreurs))
    paquet = fichier.paquet
    if paquet is None:
        return analyse

    themes = set(await db.scalars(select(Theme.slug)))
    slugs = [lecon.slug for lecon in paquet.lecons]
    existantes = {
        lecon.slug: lecon for lecon in await db.scalars(select(Lecon).where(Lecon.slug.in_(slugs)))
    }

    vus: set[str] = set()
    for lecon in paquet.lecons:
        ici = f"Leçon « {lecon.slug} »"
        if lecon.slug in vus:
            analyse.erreurs.append(Erreur(ici, "Ce slug apparaît deux fois dans le paquet."))
        vus.add(lecon.slug)
        if lecon.theme not in themes:
            disponibles = ", ".join(sorted(themes)) or "aucun"
            analyse.erreurs.append(
                Erreur(f"{ici} › theme", f"Thème inconnu. Thèmes disponibles : {disponibles}.")
            )
        existante = existantes.get(lecon.slug)
        if existante and (existante.theme.slug != lecon.theme or existante.niveau != lecon.niveau):
            analyse.erreurs.append(
                Erreur(
                    ici, "Changer le thème ou le niveau d'une leçon existante n'est pas possible."
                )
            )
        if paquet.version < 2:
            for index, bloc in enumerate(lecon.blocs, start=1):
                if isinstance(bloc, BlocExercice):
                    analyse.erreurs.append(
                        Erreur(
                            f"{ici} › bloc {index}",
                            "Le bloc « exercice » demande la version 2 du format.",
                        )
                    )
        for image in _images_utilisees(lecon):
            if image not in fichier.images:
                analyse.erreurs.append(
                    Erreur(f"{ici} › {image}", "Image absente de l'archive ZIP.")
                )
        analyse.lecons.append(
            ApercuLecon(
                slug=lecon.slug,
                titre=lecon.titre,
                theme=lecon.theme,
                action="nouvelle_version" if existante else "creation",
                nb_images=len(_images_utilisees(lecon)),
            )
        )
        analyse.codes.extend(_codes(lecon))

    if paquet.parcours:
        await _analyser_parcours(db, paquet, themes, analyse)
    return analyse


async def _analyser_parcours(
    db: AsyncSession, paquet: Paquet, themes: set[str], analyse: Analyse
) -> None:
    parcours = paquet.parcours
    if parcours is None:
        return
    ici = f"Parcours « {parcours.slug} »"
    if parcours.theme not in themes:
        analyse.erreurs.append(Erreur(f"{ici} › theme", "Thème inconnu."))
    dans_le_paquet = {lecon.slug for lecon in paquet.lecons}
    hors_paquet = [slug for slug in parcours.lecons if slug not in dans_le_paquet]
    connues = set(await db.scalars(select(Lecon.slug).where(Lecon.slug.in_(hors_paquet))))
    for slug in hors_paquet:
        if slug not in connues:
            analyse.erreurs.append(
                Erreur(
                    f"{ici} › lecons",
                    f"La leçon « {slug} » n'existe ni dans le paquet ni sur le site.",
                )
            )
    existe = await db.scalar(select(Parcours.id).where(Parcours.slug == parcours.slug))
    analyse.parcours = ApercuParcours(
        slug=parcours.slug,
        titre=parcours.titre,
        action="mise_a_jour" if existe else "creation",
        lecons=parcours.lecons,
    )


async def importer(
    db: AsyncSession, analyse: Analyse, nom_fichier: str, importateur: Utilisateur
) -> Import:
    """Crée une révision « brouillon » par leçon, et le parcours s'il y en a un."""
    paquet = analyse.fichier.paquet
    if paquet is None or not analyse.valide:
        raise ValueError("Seule une analyse valide peut être importée.")

    generation = paquet.generation
    envoi = Import(
        id=uuid.uuid4(),
        importateur_id=importateur.id,
        nom_fichier=nom_fichier[:255],
        nb_lecons=len(paquet.lecons),
        assiste_par_ia=generation.assiste_par_ia if generation else False,
        outil=generation.outil if generation else None,
    )
    db.add(envoi)
    await db.flush()

    medias = f"/medias/imports/{envoi.id}"
    themes = {theme.slug: theme for theme in await db.scalars(select(Theme))}
    for importee in paquet.lecons:
        lecon = await db.scalar(select(Lecon).where(Lecon.slug == importee.slug))
        if lecon is None:
            lecon = Lecon(
                slug=importee.slug, theme_id=themes[importee.theme].id, niveau=importee.niveau
            )
            db.add(lecon)
            await db.flush()
        numero = await db.scalar(
            select(func.coalesce(func.max(Revision.numero), 0)).where(Revision.lecon_id == lecon.id)
        )
        db.add(
            Revision(
                lecon_id=lecon.id,
                numero=(numero or 0) + 1,
                titre=importee.titre,
                resume=importee.resume,
                objectifs=importee.objectifs,
                duree_minutes=importee.duree_minutes,
                contenu=lecon_en_markdown(importee, medias),
                statut=StatutRevision.BROUILLON,
                auteur_id=importateur.id,
                assiste_par_ia=envoi.assiste_par_ia,
                import_id=envoi.id,
            )
        )

    if paquet.parcours:
        await _importer_parcours(db, paquet, themes)

    journaliser(
        db,
        importateur.id,
        "import",
        f"import:{envoi.id}",
        fichier=envoi.nom_fichier,
        lecons=", ".join(lecon.slug for lecon in paquet.lecons),
    )
    await db.flush()
    _enregistrer_images(envoi.id, analyse.fichier.images)
    return envoi


async def _importer_parcours(db: AsyncSession, paquet: Paquet, themes: dict[str, Theme]) -> None:
    """Crée ou met à jour le parcours. Il n'apparaît qu'une fois une de ses leçons publiée."""
    importe = paquet.parcours
    if importe is None:
        return
    ids = {
        lecon.slug: lecon.id
        for lecon in await db.scalars(select(Lecon).where(Lecon.slug.in_(importe.lecons)))
    }
    parcours = await db.scalar(select(Parcours).where(Parcours.slug == importe.slug))
    if parcours is None:
        parcours = Parcours(slug=importe.slug, publie=True)
        db.add(parcours)
    parcours.titre = importe.titre
    parcours.description = importe.description
    parcours.niveau = importe.niveau
    parcours.theme_id = themes[importe.theme].id
    # On vide d'abord les étapes : les positions doivent rester uniques à chaque instant.
    parcours.etapes = []
    await db.flush()
    parcours.etapes = [
        EtapeParcours(lecon_id=ids[slug], position=position)
        for position, slug in enumerate(importe.lecons, start=1)
    ]


def _enregistrer_images(import_id: uuid.UUID, images: dict[str, bytes]) -> None:
    dossier = get_config().dossier_medias / "imports" / str(import_id)
    for nom, contenu in images.items():
        chemin = dossier / nom
        chemin.parent.mkdir(parents=True, exist_ok=True)
        chemin.write_bytes(contenu)
