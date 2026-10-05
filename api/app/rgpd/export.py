"""Export des données personnelles d'un utilisateur, en JSON (ADR 0014)."""

from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.modeles import ActionJournal
from app.comptes.modeles import Role, SessionUtilisateur, Utilisateur
from app.imports.modeles import Import
from app.lecons.modeles import Lecon, Revision, StatutRevision
from app.progression.modeles import LeconTerminee
from app.relecture.modeles import Decision, Relecture


class CompteExporte(BaseModel):
    email: str
    pseudo: str
    role: Role
    inscrit_le: datetime
    email_confirme_le: datetime | None
    licence_acceptee_le: datetime | None


class SessionExportee(BaseModel):
    ouverte_le: datetime
    expire_le: datetime


class LeconTermineeExportee(BaseModel):
    lecon: str
    terminee_le: datetime


class VersionExportee(BaseModel):
    lecon: str
    numero: int
    statut: StatutRevision
    titre: str
    resume: str
    objectifs: list[str]
    duree_minutes: int
    contenu: str
    creee_le: datetime
    modifiee_le: datetime
    publiee_le: datetime | None


class RelectureExportee(BaseModel):
    lecon: str
    version: int
    decision: Decision
    commentaire: str | None
    le: datetime


class ImportExporte(BaseModel):
    fichier: str
    nb_lecons: int
    le: datetime


class ActionExportee(BaseModel):
    action: str
    cible: str
    details: dict[str, str]
    le: datetime


class Export(BaseModel):
    """Tout ce que la plateforme garde sur toi. Le mot de passe n'est stocké que haché."""

    format: str = "renard-etudiant/donnees-personnelles"
    exporte_le: datetime
    compte: CompteExporte
    sessions: list[SessionExportee]
    lecons_terminees: list[LeconTermineeExportee]
    contributions: list[VersionExportee]
    relectures: list[RelectureExportee]
    imports: list[ImportExporte]
    actions: list[ActionExportee]


async def exporter(db: AsyncSession, utilisateur: Utilisateur, le: datetime) -> Export:
    uid = utilisateur.id
    sessions = await db.scalars(
        select(SessionUtilisateur)
        .where(SessionUtilisateur.utilisateur_id == uid)
        .order_by(SessionUtilisateur.cree_le)
    )
    terminees = await db.execute(
        select(Lecon.slug, LeconTerminee.terminee_le)
        .join(Lecon, Lecon.id == LeconTerminee.lecon_id)
        .where(LeconTerminee.utilisateur_id == uid)
        .order_by(LeconTerminee.terminee_le)
    )
    versions = await db.execute(
        select(Lecon.slug, Revision)
        .join(Lecon, Lecon.id == Revision.lecon_id)
        .where(Revision.auteur_id == uid)
        .order_by(Revision.cree_le)
    )
    relectures = await db.execute(
        select(Lecon.slug, Revision.numero, Relecture)
        .join(Revision, Revision.id == Relecture.revision_id)
        .join(Lecon, Lecon.id == Revision.lecon_id)
        .where(Relecture.relecteur_id == uid)
        .order_by(Relecture.cree_le)
    )
    imports = await db.scalars(
        select(Import).where(Import.importateur_id == uid).order_by(Import.cree_le)
    )
    actions = await db.scalars(
        select(ActionJournal).where(ActionJournal.acteur_id == uid).order_by(ActionJournal.id)
    )
    return Export(
        exporte_le=le,
        compte=CompteExporte(
            email=utilisateur.email,
            pseudo=utilisateur.pseudo,
            role=utilisateur.role,
            inscrit_le=utilisateur.cree_le,
            email_confirme_le=utilisateur.email_verifie_le,
            licence_acceptee_le=utilisateur.licence_acceptee_le,
        ),
        sessions=[SessionExportee(ouverte_le=s.cree_le, expire_le=s.expire_le) for s in sessions],
        lecons_terminees=[
            LeconTermineeExportee(lecon=slug, terminee_le=date) for slug, date in terminees
        ],
        contributions=[
            VersionExportee(
                lecon=slug,
                numero=r.numero,
                statut=r.statut,
                titre=r.titre,
                resume=r.resume,
                objectifs=r.objectifs,
                duree_minutes=r.duree_minutes,
                contenu=r.contenu,
                creee_le=r.cree_le,
                modifiee_le=r.modifiee_le,
                publiee_le=r.publiee_le,
            )
            for slug, r in versions
        ],
        relectures=[
            RelectureExportee(
                lecon=slug,
                version=numero,
                decision=r.decision,
                commentaire=r.commentaire,
                le=r.cree_le,
            )
            for slug, numero, r in relectures
        ],
        imports=[
            ImportExporte(fichier=i.nom_fichier, nb_lecons=i.nb_lecons, le=i.cree_le)
            for i in imports
        ],
        actions=[
            ActionExportee(action=a.action, cible=a.cible, details=a.details, le=a.cree_le)
            for a in actions
        ],
    )
