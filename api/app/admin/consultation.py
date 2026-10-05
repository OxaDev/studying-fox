"""Consultation du journal des actions sensibles (cadrage § 5.8)."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from app.admin.modeles import ActionJournal
from app.comptes.dependances import Db, exiger_role
from app.comptes.modeles import Role, Utilisateur
from app.lecons.modeles import Lecon, Revision

router = APIRouter(
    prefix="/admin/journal", tags=["admin"], dependencies=[Depends(exiger_role(Role.ADMIN))]
)

# Acteur absent : action lancée en ligne de commande, ou par un compte supprimé depuis.
SANS_ACTEUR = "Système ou compte supprimé"


class Action(BaseModel):
    id: int
    action: str
    acteur: str
    # La cible en clair : pseudo, titre de leçon, nom de fichier…
    cible: str
    details: dict[str, str]
    cree_le: datetime


class PageJournal(BaseModel):
    actions: list[Action]
    total: int


def _uuid(valeur: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(valeur)
    except ValueError:
        return None


async def _libelles(db: Db, cibles: set[str]) -> dict[str, str]:
    """Traduit « utilisateur:<id> » ou « revision:<id> » en texte lisible."""
    ids: dict[str, set[uuid.UUID]] = {"utilisateur": set(), "revision": set()}
    for cible in cibles:
        genre, _, valeur = cible.partition(":")
        identifiant = _uuid(valeur)
        if genre in ids and identifiant:
            ids[genre].add(identifiant)

    libelles = {}
    for identifiant, pseudo in await db.execute(
        select(Utilisateur.id, Utilisateur.pseudo).where(Utilisateur.id.in_(ids["utilisateur"]))
    ):
        libelles[f"utilisateur:{identifiant}"] = pseudo
    for identifiant, titre, numero in await db.execute(
        select(Revision.id, Revision.titre, Revision.numero)
        .join(Lecon, Lecon.id == Revision.lecon_id)
        .where(Revision.id.in_(ids["revision"]))
    ):
        libelles[f"revision:{identifiant}"] = f"« {titre} », version {numero}"

    for cible in cibles:
        genre, _, valeur = cible.partition(":")
        if cible in libelles:
            continue
        if genre == "utilisateur":
            libelles[cible] = "Compte supprimé"
        elif genre == "revision":
            libelles[cible] = "Version supprimée"
        elif genre == "theme":
            libelles[cible] = f"Thème {valeur}"
        elif genre == "import":
            libelles[cible] = "Import de leçons"
        else:
            libelles[cible] = cible
    return libelles


@router.get("")
async def consulter_journal(
    db: Db,
    action: str | None = Query(default=None, max_length=50),
    limite: int = Query(default=50, ge=1, le=200),
    decalage: int = Query(default=0, ge=0),
) -> PageJournal:
    """Les actions les plus récentes d'abord. Conservées un an (ADR 0014)."""
    criteres = [ActionJournal.action == action] if action else []
    total = await db.scalar(select(func.count()).select_from(ActionJournal).where(*criteres))
    lignes = (
        await db.execute(
            select(ActionJournal, Utilisateur.pseudo)
            .outerjoin(Utilisateur, Utilisateur.id == ActionJournal.acteur_id)
            .where(*criteres)
            .order_by(ActionJournal.id.desc())
            .limit(limite)
            .offset(decalage)
        )
    ).all()
    libelles = await _libelles(db, {entree.cible for entree, _ in lignes})
    return PageJournal(
        actions=[
            Action(
                id=entree.id,
                action=entree.action,
                acteur=pseudo or SANS_ACTEUR,
                cible=libelles[entree.cible],
                details=entree.details,
                cree_le=entree.cree_le,
            )
            for entree, pseudo in lignes
        ],
        total=total or 0,
    )
