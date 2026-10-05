"""Leçons terminées et tableau de bord (cadrage § 5.3)."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from app.comptes.dependances import Db, Ecriture, Lecture
from app.lecons.modeles import Lecon
from app.parcours.schemas import Espace
from app.parcours.service import lecons_terminees, parcours_publies, resume
from app.progression.modeles import LeconTerminee

router = APIRouter(prefix="/progression", tags=["progression"])


async def _lecon_publiee(db: Db, slug: str) -> Lecon:
    lecon = await db.scalar(select(Lecon).where(Lecon.slug == slug))
    if lecon is None or lecon.revision_publiee_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leçon introuvable.")
    return lecon


@router.put("/lecons/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def terminer_lecon(slug: str, connecte: Ecriture, db: Db) -> None:
    """Marque la leçon comme terminée. Sans effet si elle l'est déjà."""
    lecon = await _lecon_publiee(db, slug)
    await db.execute(
        insert(LeconTerminee)
        .values(utilisateur_id=connecte.utilisateur.id, lecon_id=lecon.id)
        .on_conflict_do_nothing()
    )
    await db.commit()


@router.delete("/lecons/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def reprendre_lecon(slug: str, connecte: Ecriture, db: Db) -> None:
    """Retire la leçon des leçons terminées."""
    lecon = await _lecon_publiee(db, slug)
    await db.execute(
        delete(LeconTerminee).where(
            LeconTerminee.utilisateur_id == connecte.utilisateur.id,
            LeconTerminee.lecon_id == lecon.id,
        )
    )
    await db.commit()


@router.get("")
async def espace(connecte: Lecture, db: Db) -> Espace:
    terminees = await lecons_terminees(db, connecte.utilisateur.id)
    resumes = [resume(parcours, terminees) for parcours in await parcours_publies(db)]
    commences = [r for r in resumes if r.nb_terminees > 0]
    total = sum(r.nb_lecons for r in commences)
    faites = sum(r.nb_terminees for r in commences)
    return Espace(
        lecons_terminees=len(terminees),
        pourcentage=round(100 * faites / total) if total else 0,
        parcours_en_cours=[r for r in commences if r.nb_terminees < r.nb_lecons],
        parcours_termines=[r for r in commences if r.nb_terminees == r.nb_lecons],
    )
