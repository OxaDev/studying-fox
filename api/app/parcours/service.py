"""Calcul de l'avancement d'un apprenant dans les parcours."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.lecons.modeles import Lecon, Revision
from app.lecons.schemas import ThemeLecture
from app.parcours.modeles import Parcours
from app.parcours.schemas import EtapeLecture, ParcoursDetail, ResumeParcours
from app.progression.modeles import LeconTerminee


async def lecons_terminees(db: AsyncSession, utilisateur_id: uuid.UUID) -> set[uuid.UUID]:
    resultat = await db.scalars(
        select(LeconTerminee.lecon_id).where(LeconTerminee.utilisateur_id == utilisateur_id)
    )
    return set(resultat)


def est_visible(parcours: Parcours) -> bool:
    """Un parcours n'apparaît qu'une fois au moins une de ses leçons publiée."""
    return parcours.publie and bool(_lecons_publiees(parcours))


async def parcours_publies(db: AsyncSession) -> list[Parcours]:
    resultat = await db.scalars(
        select(Parcours).where(Parcours.publie.is_(True)).order_by(Parcours.titre)
    )
    return [parcours for parcours in resultat if est_visible(parcours)]


def _lecons_publiees(parcours: Parcours) -> list[tuple[Lecon, Revision]]:
    """Leçons du parcours dans l'ordre, sans celles qui ne sont pas (ou plus) publiées."""
    return [
        (etape.lecon, etape.lecon.revision_publiee)
        for etape in parcours.etapes
        if etape.lecon.revision_publiee is not None
    ]


def detail(parcours: Parcours, terminees: set[uuid.UUID]) -> ParcoursDetail:
    lecons = _lecons_publiees(parcours)
    etapes = [
        EtapeLecture(
            slug=lecon.slug,
            titre=revision.titre,
            duree_minutes=revision.duree_minutes,
            terminee=lecon.id in terminees,
        )
        for lecon, revision in lecons
    ]
    return ParcoursDetail(
        slug=parcours.slug,
        titre=parcours.titre,
        description=parcours.description,
        niveau=parcours.niveau,
        theme=ThemeLecture(slug=parcours.theme.slug, nom=parcours.theme.nom),
        nb_lecons=len(etapes),
        nb_terminees=sum(etape.terminee for etape in etapes),
        duree_minutes=sum(etape.duree_minutes for etape in etapes),
        lecons=etapes,
        prochaine_lecon=next((etape.slug for etape in etapes if not etape.terminee), None),
    )


def resume(parcours: Parcours, terminees: set[uuid.UUID]) -> ResumeParcours:
    return ResumeParcours.model_validate(detail(parcours, terminees), from_attributes=True)
