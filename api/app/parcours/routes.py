"""Parcours publiés et avancement de l'apprenant connecté (jalon 3)."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.comptes.dependances import Db, Lecture
from app.parcours.modeles import Parcours
from app.parcours.schemas import ParcoursDetail, ResumeParcours
from app.parcours.service import (
    detail,
    est_visible,
    lecons_terminees,
    parcours_publies,
    resume,
)

router = APIRouter(prefix="/parcours", tags=["parcours"])


@router.get("")
async def lister_parcours(connecte: Lecture, db: Db) -> list[ResumeParcours]:
    terminees = await lecons_terminees(db, connecte.utilisateur.id)
    return [resume(parcours, terminees) for parcours in await parcours_publies(db)]


@router.get("/{slug}")
async def lire_parcours(slug: str, connecte: Lecture, db: Db) -> ParcoursDetail:
    parcours = await db.scalar(
        select(Parcours).where(Parcours.slug == slug, Parcours.publie.is_(True))
    )
    if parcours is None or not est_visible(parcours):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Parcours introuvable.")
    return detail(parcours, await lecons_terminees(db, connecte.utilisateur.id))
