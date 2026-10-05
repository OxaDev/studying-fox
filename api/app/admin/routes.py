"""Administration des utilisateurs : rôles et suspension (cadrage § 5.8)."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select

from app.admin.journal import journaliser
from app.comptes.dependances import Db, Ecriture, exiger_role
from app.comptes.modeles import Role, Utilisateur
from app.comptes.service import fermer_sessions

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(exiger_role(Role.ADMIN))])


class UtilisateurAdmin(BaseModel):
    id: uuid.UUID
    email: str
    pseudo: str
    role: Role
    email_verifie: bool
    suspendu: bool
    cree_le: datetime

    @classmethod
    def depuis(cls, u: Utilisateur) -> "UtilisateurAdmin":
        return cls(
            id=u.id,
            email=u.email,
            pseudo=u.pseudo,
            role=u.role,
            email_verifie=u.email_verifie_le is not None,
            suspendu=u.suspendu,
            cree_le=u.cree_le,
        )


class ModificationUtilisateur(BaseModel):
    role: Role | None = None
    suspendu: bool | None = None


class PageUtilisateurs(BaseModel):
    utilisateurs: list[UtilisateurAdmin]
    # Nombre total de comptes correspondant à la recherche, pour paginer.
    total: int


@router.get("/utilisateurs")
async def lister_utilisateurs(
    db: Db,
    q: str = Query(default="", max_length=254, description="Début du pseudo ou de l'email"),
    limite: int = Query(default=50, ge=1, le=200),
    decalage: int = Query(default=0, ge=0),
) -> PageUtilisateurs:
    criteres = []
    if q.strip():
        # Les jokers de LIKE saisis sont pris au pied de la lettre.
        motif = q.strip().lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        criteres.append(
            or_(
                func.lower(Utilisateur.pseudo).like(f"{motif}%"),
                Utilisateur.email.like(f"{motif}%"),
            )
        )
    total = await db.scalar(select(func.count()).select_from(Utilisateur).where(*criteres))
    utilisateurs = await db.scalars(
        select(Utilisateur)
        .where(*criteres)
        .order_by(Utilisateur.cree_le.desc(), Utilisateur.id)
        .limit(limite)
        .offset(decalage)
    )
    return PageUtilisateurs(
        utilisateurs=[UtilisateurAdmin.depuis(u) for u in utilisateurs], total=total or 0
    )


@router.patch("/utilisateurs/{utilisateur_id}")
async def modifier_utilisateur(
    utilisateur_id: uuid.UUID, donnees: ModificationUtilisateur, connecte: Ecriture, db: Db
) -> UtilisateurAdmin:
    if utilisateur_id == connecte.utilisateur.id:
        # Évite qu'un admin se retire ses propres droits par erreur.
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Tu ne peux pas modifier ton propre compte."
        )
    utilisateur = await db.get(Utilisateur, utilisateur_id)
    if utilisateur is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Utilisateur introuvable.")

    cible = f"utilisateur:{utilisateur.id}"
    acteur = connecte.utilisateur.id
    if donnees.role is not None and donnees.role != utilisateur.role:
        journaliser(
            db, acteur, "changement_role", cible, avant=utilisateur.role, apres=donnees.role
        )
        utilisateur.role = donnees.role
    if donnees.suspendu is not None and donnees.suspendu != utilisateur.suspendu:
        journaliser(db, acteur, "suspension" if donnees.suspendu else "reactivation", cible)
        utilisateur.suspendu = donnees.suspendu
        if donnees.suspendu:
            await fermer_sessions(db, utilisateur.id)

    await db.commit()
    return UtilisateurAdmin.depuis(utilisateur)
