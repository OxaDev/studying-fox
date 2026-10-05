"""Lecture des leçons publiées (jalon 2). Réservée aux comptes connectés (cadrage § 3)."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.comptes.dependances import Db, Lecture
from app.comptes.modeles import Utilisateur
from app.lecons.modeles import Lecon, Revision, StatutRevision, Theme
from app.lecons.schemas import LeconPubliee, ResumeLecon, ThemeLecture
from app.progression.modeles import LeconTerminee

router = APIRouter(prefix="/lecons", tags=["leçons"])

AUTEUR_ANONYME = "Contributeur anonyme"


def _resume(lecon: Lecon, revision: Revision) -> ResumeLecon:
    return ResumeLecon(
        slug=lecon.slug,
        titre=revision.titre,
        resume=revision.resume,
        theme=ThemeLecture(slug=lecon.theme.slug, nom=lecon.theme.nom),
        niveau=lecon.niveau,
        duree_minutes=revision.duree_minutes,
    )


@router.get("")
async def lister_lecons(_: Lecture, db: Db) -> list[ResumeLecon]:
    lecons = await db.scalars(
        select(Lecon)
        .join(Lecon.revision_publiee)
        .join(Lecon.theme)
        .order_by(Theme.nom, Revision.titre)
    )
    return [_resume(lecon, lecon.revision_publiee) for lecon in lecons if lecon.revision_publiee]


@router.get("/themes")
async def lister_themes(_: Lecture, db: Db) -> list[ThemeLecture]:
    themes = await db.scalars(select(Theme).order_by(Theme.nom))
    return [ThemeLecture(slug=theme.slug, nom=theme.nom) for theme in themes]


@router.get("/{slug}")
async def lire_lecon(slug: str, connecte: Lecture, db: Db) -> LeconPubliee:
    lecon = await db.scalar(select(Lecon).where(Lecon.slug == slug))
    revision = lecon.revision_publiee if lecon else None
    if lecon is None or revision is None or revision.publiee_le is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leçon introuvable.")

    pseudos = await db.execute(
        select(Utilisateur.pseudo)
        .select_from(Revision)
        .outerjoin(Utilisateur, Utilisateur.id == Revision.auteur_id)
        .where(Revision.lecon_id == lecon.id, Revision.statut == StatutRevision.PUBLIEE)
        .order_by(Revision.numero)
    )
    auteurs = list(dict.fromkeys(pseudo or AUTEUR_ANONYME for (pseudo,) in pseudos))

    terminee = await db.get(LeconTerminee, (connecte.utilisateur.id, lecon.id)) is not None

    return LeconPubliee(
        **_resume(lecon, revision).model_dump(),
        objectifs=revision.objectifs,
        contenu=revision.contenu,
        assiste_par_ia=revision.assiste_par_ia,
        auteurs=auteurs,
        publiee_le=revision.publiee_le,
        terminee=terminee,
    )
