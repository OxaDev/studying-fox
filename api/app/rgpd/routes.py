"""Télécharger ses données et supprimer son compte, depuis le profil (ADR 0014)."""

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import func, select

from app.admin.journal import journaliser
from app.comptes.dependances import COOKIE_SESSION, Db, Ecriture, Lecture
from app.comptes.modeles import Role, Utilisateur
from app.comptes.routes import verifier_mot_de_passe_actuel
from app.comptes.schemas import MotDePasseSaisi
from app.rgpd.export import Export, exporter
from app.rgpd.suppression import supprimer_compte
from app.temps import maintenant

router = APIRouter(prefix="/comptes/moi", tags=["mes données"])

NOM_FICHIER = "mes-donnees-renard-etudiant.json"


class DemandeSuppression(BaseModel):
    mot_de_passe: MotDePasseSaisi


@router.get("/export")
async def telecharger_mes_donnees(connecte: Lecture, db: Db, response: Response) -> Export:
    response.headers["Content-Disposition"] = f'attachment; filename="{NOM_FICHIER}"'
    response.headers["Cache-Control"] = "no-store"
    return await exporter(db, connecte.utilisateur, maintenant())


@router.post("/suppression", status_code=status.HTTP_204_NO_CONTENT)
async def supprimer_mon_compte(
    demande: DemandeSuppression, connecte: Ecriture, db: Db, response: Response
) -> None:
    """Supprime le compte pour de bon. Le mot de passe est redemandé."""
    utilisateur = connecte.utilisateur
    await verifier_mot_de_passe_actuel(utilisateur, demande.mot_de_passe)
    if utilisateur.role is Role.ADMIN:
        admins = await db.scalar(
            select(func.count())
            .select_from(Utilisateur)
            .where(Utilisateur.role == Role.ADMIN, Utilisateur.suspendu.is_(False))
        )
        if admins == 1:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Tu es le seul admin : nomme un autre admin avant de supprimer ton compte.",
            )
    # Aucune donnée personnelle au journal : l'identifiant ne renverra plus à rien.
    journaliser(db, None, "suppression_compte", f"utilisateur:{utilisateur.id}")
    await supprimer_compte(db, utilisateur)
    await db.commit()
    response.delete_cookie(COOKIE_SESSION, path="/")
