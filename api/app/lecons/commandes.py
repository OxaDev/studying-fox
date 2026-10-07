"""Commandes de développement pour les leçons.

Charger les leçons de l'exemple officiel, publiées directement (refusé en production) :
    uv run python -m app.lecons.commandes charger-exemple [chemin.json]

En production, les leçons passent par l'import et la relecture (jalon 4).
"""

import argparse
import asyncio
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_config
from app.db import SessionLocale
from app.imports.conversion import lecon_en_markdown
from app.imports.format import Paquet
from app.lecons.modeles import Lecon, Revision, StatutRevision, Theme
from app.lecons.themes import NOMS_THEMES
from app.modeles import __all__ as _tous_les_modeles  # noqa: F401  (enregistre les tables)
from app.parcours.modeles import EtapeParcours, Parcours
from app.temps import maintenant

EXEMPLE = Path(__file__).parents[3] / "docs" / "format-lecon" / "exemple.json"


async def _theme(db: AsyncSession, slug: str) -> Theme:
    theme = await db.scalar(select(Theme).where(Theme.slug == slug))
    if theme is None:
        theme = Theme(slug=slug, nom=NOMS_THEMES.get(slug, slug.capitalize()))
        db.add(theme)
        await db.flush()
    return theme


async def charger_paquet(db: AsyncSession, paquet: Paquet) -> list[str]:
    """Publie les leçons du paquet. Ignore celles qui existent déjà. Renvoie les slugs créés."""
    assiste_par_ia = paquet.generation.assiste_par_ia if paquet.generation else False
    crees: list[str] = []
    for importee in paquet.lecons:
        if await db.scalar(select(Lecon.id).where(Lecon.slug == importee.slug)):
            continue
        theme = await _theme(db, importee.theme)
        # Mêmes identifiants que le fichier (version 3) : pas de doublon avec validated_courses.
        lecon = Lecon(
            id=importee.id or uuid.uuid4(),
            slug=importee.slug,
            theme_id=theme.id,
            niveau=importee.niveau,
        )
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
        crees.append(importee.slug)
    if paquet.parcours:
        await _charger_parcours(db, paquet)
    await db.commit()
    return crees


async def _charger_parcours(db: AsyncSession, paquet: Paquet) -> None:
    """Crée le parcours du paquet, publié, s'il n'existe pas encore."""
    importe = paquet.parcours
    if importe is None or await db.scalar(select(Parcours.id).where(Parcours.slug == importe.slug)):
        return
    theme = await _theme(db, importe.theme)
    lecons = {
        lecon.slug: lecon.id
        for lecon in await db.scalars(select(Lecon).where(Lecon.slug.in_(importe.lecons)))
    }
    db.add(
        Parcours(
            id=importe.id or uuid.uuid4(),
            slug=importe.slug,
            titre=importe.titre,
            description=importe.description,
            niveau=importe.niveau,
            theme_id=theme.id,
            publie=True,
            etapes=[
                EtapeParcours(lecon_id=lecons[slug], position=position)
                for position, slug in enumerate(importe.lecons, start=1)
                if slug in lecons
            ],
        )
    )


async def charger_exemple(paquet: Paquet) -> None:
    async with SessionLocale() as db:
        crees = await charger_paquet(db, paquet)
    print(f"{len(crees)} leçon(s) publiée(s) : {', '.join(crees) or 'aucune nouvelle'}")


def main() -> None:
    parseur = argparse.ArgumentParser(description=__doc__)
    commandes = parseur.add_subparsers(dest="commande", required=True)
    chargement = commandes.add_parser("charger-exemple", help="Publie les leçons d'un paquet.")
    chargement.add_argument("chemin", nargs="?", type=Path, default=EXEMPLE)
    arguments = parseur.parse_args()

    if arguments.commande == "charger-exemple":
        if get_config().environnement == "prod":
            raise SystemExit("Commande réservée au développement.")
        paquet = Paquet.model_validate_json(arguments.chemin.read_text(encoding="utf-8"))
        asyncio.run(charger_exemple(paquet))


if __name__ == "__main__":
    main()
