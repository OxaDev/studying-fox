"""File de relecture et décisions : publier, demander des corrections, refuser (ADR 0010)."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.journal import journaliser
from app.comptes.dependances import Db, Ecriture, Lecture, exiger_role
from app.comptes.modeles import Role, Utilisateur
from app.imports.modeles import Import
from app.lecons.modeles import Lecon, Niveau, Revision, StatutRevision
from app.lecons.routes import AUTEUR_ANONYME
from app.lecons.schemas import ThemeLecture
from app.relecture.modeles import Decision, Relecture
from app.temps import maintenant

router = APIRouter(
    prefix="/relecture",
    tags=["relecture"],
    dependencies=[Depends(exiger_role(Role.RELECTEUR))],
)

# À relire : les révisions soumises, et les brouillons venus d'un import (ADR 0019).
A_RELIRE = or_(
    Revision.statut == StatutRevision.EN_RELECTURE,
    and_(Revision.statut == StatutRevision.BROUILLON, Revision.import_id.is_not(None)),
)

NOUVEAU_STATUT = {
    Decision.PUBLIER: StatutRevision.PUBLIEE,
    Decision.CORRIGER: StatutRevision.A_CORRIGER,
    Decision.REFUSER: StatutRevision.REFUSEE,
}


class ElementFile(BaseModel):
    revision_id: uuid.UUID
    lecon_slug: str
    titre: str
    numero: int
    statut: StatutRevision
    auteur: str
    assiste_par_ia: bool
    fichier_importe: str | None
    cree_le: datetime
    # Faux si le relecteur est l'auteur d'une révision écrite à la main (ADR 0010).
    peut_publier: bool


class DecisionLue(BaseModel):
    decision: Decision
    relecteur: str
    commentaire: str | None
    cree_le: datetime


class VersionHistorique(BaseModel):
    revision_id: uuid.UUID
    numero: int
    statut: StatutRevision
    auteur: str
    cree_le: datetime
    publiee_le: datetime | None
    en_ligne: bool
    decisions: list[DecisionLue]


class RevisionARelire(BaseModel):
    revision_id: uuid.UUID
    lecon_slug: str
    numero: int
    statut: StatutRevision
    titre: str
    resume: str
    objectifs: list[str]
    duree_minutes: int
    contenu: str
    theme: ThemeLecture
    niveau: Niveau
    auteur: str
    assiste_par_ia: bool
    fichier_importe: str | None
    a_relire: bool
    # Faux si le relecteur est l'auteur d'une révision écrite à la main (ADR 0010).
    peut_publier: bool
    historique: list[VersionHistorique]


class DemandeDecision(BaseModel):
    decision: Decision
    commentaire: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def commentaire_si_pas_publiee(self) -> "DemandeDecision":
        if self.decision is not Decision.PUBLIER and not (self.commentaire or "").strip():
            raise ValueError("Un commentaire est obligatoire pour expliquer la décision.")
        return self


class DemandeDecisionGroupee(DemandeDecision):
    """La même décision pour plusieurs versions, par exemple toutes celles d'un import."""

    revision_ids: list[uuid.UUID] = Field(min_length=1, max_length=50)


class ResultatDecisionGroupee(BaseModel):
    revision_ids: list[uuid.UUID]


async def _pseudos(db: AsyncSession, ids: set[uuid.UUID | None]) -> dict[uuid.UUID, str]:
    connus = {i for i in ids if i is not None}
    if not connus:
        return {}
    lignes = await db.execute(
        select(Utilisateur.id, Utilisateur.pseudo).where(Utilisateur.id.in_(connus))
    )
    return {identifiant: pseudo for identifiant, pseudo in lignes}


def _peut_publier(revision: Revision, relecteur: Utilisateur) -> bool:
    return revision.import_id is not None or revision.auteur_id != relecteur.id


def _a_relire(revision: Revision) -> bool:
    return revision.statut is StatutRevision.EN_RELECTURE or (
        revision.statut is StatutRevision.BROUILLON and revision.import_id is not None
    )


@router.get("")
async def file_de_relecture(connecte: Lecture, db: Db) -> list[ElementFile]:
    lignes = await db.execute(
        select(Revision, Lecon.slug, Import.nom_fichier)
        .join(Lecon, Lecon.id == Revision.lecon_id)
        .outerjoin(Import, Import.id == Revision.import_id)
        .where(A_RELIRE)
        .order_by(Revision.cree_le, Lecon.slug)
    )
    elements = [(revision, slug, fichier) for revision, slug, fichier in lignes]
    pseudos = await _pseudos(db, {revision.auteur_id for revision, _, _ in elements})
    return [
        ElementFile(
            revision_id=revision.id,
            lecon_slug=slug,
            titre=revision.titre,
            numero=revision.numero,
            statut=revision.statut,
            auteur=pseudos.get(revision.auteur_id, AUTEUR_ANONYME)
            if revision.auteur_id
            else AUTEUR_ANONYME,
            assiste_par_ia=revision.assiste_par_ia,
            fichier_importe=fichier,
            cree_le=revision.cree_le,
            peut_publier=_peut_publier(revision, connecte.utilisateur),
        )
        for revision, slug, fichier in elements
    ]


async def _detail(db: AsyncSession, revision: Revision, relecteur: Utilisateur) -> RevisionARelire:
    lecon = await db.get(Lecon, revision.lecon_id)
    if lecon is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leçon introuvable.")
    versions = list(
        await db.scalars(
            select(Revision).where(Revision.lecon_id == lecon.id).order_by(Revision.numero.desc())
        )
    )
    relectures = list(
        await db.scalars(
            select(Relecture)
            .where(Relecture.revision_id.in_([v.id for v in versions]))
            .order_by(Relecture.cree_le)
        )
    )
    pseudos = await _pseudos(
        db, {v.auteur_id for v in versions} | {r.relecteur_id for r in relectures}
    )

    def nom(identifiant: uuid.UUID | None) -> str:
        return pseudos.get(identifiant, AUTEUR_ANONYME) if identifiant else AUTEUR_ANONYME

    fichier = await db.get(Import, revision.import_id) if revision.import_id else None
    return RevisionARelire(
        revision_id=revision.id,
        lecon_slug=lecon.slug,
        numero=revision.numero,
        statut=revision.statut,
        titre=revision.titre,
        resume=revision.resume,
        objectifs=revision.objectifs,
        duree_minutes=revision.duree_minutes,
        contenu=revision.contenu,
        theme=ThemeLecture(slug=lecon.theme.slug, nom=lecon.theme.nom),
        niveau=lecon.niveau,
        auteur=nom(revision.auteur_id),
        assiste_par_ia=revision.assiste_par_ia,
        fichier_importe=fichier.nom_fichier if fichier else None,
        a_relire=_a_relire(revision),
        peut_publier=_peut_publier(revision, relecteur),
        historique=[
            VersionHistorique(
                revision_id=version.id,
                numero=version.numero,
                statut=version.statut,
                auteur=nom(version.auteur_id),
                cree_le=version.cree_le,
                publiee_le=version.publiee_le,
                en_ligne=version.id == lecon.revision_publiee_id,
                decisions=[
                    DecisionLue(
                        decision=r.decision,
                        relecteur=nom(r.relecteur_id),
                        commentaire=r.commentaire,
                        cree_le=r.cree_le,
                    )
                    for r in relectures
                    if r.revision_id == version.id
                ],
            )
            for version in versions
        ],
    )


async def _revision(db: AsyncSession, revision_id: uuid.UUID) -> Revision:
    revision = await db.get(Revision, revision_id)
    if revision is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version introuvable.")
    return revision


@router.get("/{revision_id}")
async def lire_revision(revision_id: uuid.UUID, connecte: Lecture, db: Db) -> RevisionARelire:
    return await _detail(db, await _revision(db, revision_id), connecte.utilisateur)


def _appliquer(
    db: AsyncSession,
    revision: Revision,
    lecon: Lecon,
    relecteur: Utilisateur,
    demande: DemandeDecision,
) -> None:
    """Vérifie puis enregistre la décision, sans valider la transaction."""
    slug = lecon.slug
    if not _a_relire(revision):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"La leçon « {slug} » n'attend pas de relecture."
        )
    if demande.decision is Decision.PUBLIER and not _peut_publier(revision, relecteur):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Tu ne peux pas publier la leçon « {slug} » : tu l'as écrite.",
        )

    revision.statut = NOUVEAU_STATUT[demande.decision]
    db.add(
        Relecture(
            revision_id=revision.id,
            relecteur_id=relecteur.id,
            decision=demande.decision,
            commentaire=(demande.commentaire or "").strip() or None,
        )
    )
    if demande.decision is Decision.PUBLIER:
        revision.publiee_le = maintenant()
        lecon.revision_publiee_id = revision.id
    journaliser(
        db,
        relecteur.id,
        f"relecture_{demande.decision}",
        f"revision:{revision.id}",
        lecon=slug,
        version=str(revision.numero),
    )


@router.post("/decisions")
async def decider_en_groupe(
    demande: DemandeDecisionGroupee, connecte: Ecriture, db: Db
) -> ResultatDecisionGroupee:
    """Applique la même décision à plusieurs versions. C'est tout ou rien."""
    ids = list(dict.fromkeys(demande.revision_ids))
    lignes = await db.execute(
        select(Revision, Lecon)
        .join(Lecon, Lecon.id == Revision.lecon_id)
        .where(Revision.id.in_(ids))
        .order_by(Lecon.slug, Revision.numero)  # la version la plus récente l'emporte
    )
    revisions = [(revision, lecon) for revision, lecon in lignes]
    if len(revisions) != len(ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Une des versions est introuvable.")
    for revision, lecon in revisions:
        _appliquer(db, revision, lecon, connecte.utilisateur, demande)
    await db.commit()
    return ResultatDecisionGroupee(revision_ids=[revision.id for revision, _ in revisions])


@router.post("/{revision_id}/decision")
async def decider(
    revision_id: uuid.UUID, demande: DemandeDecision, connecte: Ecriture, db: Db
) -> RevisionARelire:
    revision = await _revision(db, revision_id)
    lecon = await db.get(Lecon, revision.lecon_id)
    if lecon is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leçon introuvable.")
    _appliquer(db, revision, lecon, connecte.utilisateur, demande)
    await db.commit()
    return await _detail(db, revision, connecte.utilisateur)
