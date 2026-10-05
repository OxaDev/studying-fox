"""Opérations sur les comptes, utilisées par les routes et les commandes."""

import uuid
from datetime import timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.comptes.modeles import JetonEmail, SessionUtilisateur, TypeJeton, Utilisateur
from app.comptes.securite import empreinte, generer_jeton
from app.config import get_config
from app.temps import maintenant

DUREE_JETON = {
    TypeJeton.CONFIRMATION: timedelta(hours=48),
    TypeJeton.REINITIALISATION: timedelta(hours=1),
    TypeJeton.CHANGEMENT_EMAIL: timedelta(hours=48),
}


async def trouver_par_email(db: AsyncSession, email: str) -> Utilisateur | None:
    return await db.scalar(select(Utilisateur).where(Utilisateur.email == email))


async def pseudo_pris(db: AsyncSession, pseudo: str, sauf: uuid.UUID | None = None) -> bool:
    requete = select(Utilisateur.id).where(func.lower(Utilisateur.pseudo) == pseudo.lower())
    if sauf is not None:
        requete = requete.where(Utilisateur.id != sauf)
    return await db.scalar(requete) is not None


async def creer_jeton_email(
    db: AsyncSession,
    utilisateur: Utilisateur,
    type_jeton: TypeJeton,
    nouvel_email: str | None = None,
) -> str:
    """Crée un jeton à usage unique. Les jetons précédents du même type sont annulés."""
    await db.execute(
        delete(JetonEmail).where(
            JetonEmail.utilisateur_id == utilisateur.id, JetonEmail.type == type_jeton
        )
    )
    jeton = generer_jeton()
    db.add(
        JetonEmail(
            empreinte=empreinte(jeton),
            utilisateur_id=utilisateur.id,
            type=type_jeton,
            nouvel_email=nouvel_email,
            expire_le=maintenant() + DUREE_JETON[type_jeton],
        )
    )
    return jeton


async def consommer_jeton(
    db: AsyncSession, jeton: str, types: set[TypeJeton]
) -> tuple[JetonEmail, Utilisateur] | None:
    """Renvoie le jeton et son utilisateur, puis supprime le jeton. None s'il est invalide."""
    trouve = await db.get(JetonEmail, empreinte(jeton))
    if trouve is None or trouve.type not in types or trouve.expire_le <= maintenant():
        return None
    utilisateur = await db.get(Utilisateur, trouve.utilisateur_id)
    if utilisateur is None:
        return None
    await db.delete(trouve)
    return trouve, utilisateur


async def ouvrir_session(
    db: AsyncSession, utilisateur: Utilisateur
) -> tuple[str, SessionUtilisateur]:
    """Ouvre une session et renvoie le jeton à placer dans le cookie."""
    await db.execute(
        delete(SessionUtilisateur).where(
            SessionUtilisateur.utilisateur_id == utilisateur.id,
            SessionUtilisateur.expire_le <= maintenant(),
        )
    )
    jeton = generer_jeton()
    session = SessionUtilisateur(
        empreinte=empreinte(jeton),
        utilisateur_id=utilisateur.id,
        utilisateur=utilisateur,
        jeton_csrf=generer_jeton(),
        expire_le=maintenant() + timedelta(days=get_config().duree_session_jours),
    )
    db.add(session)
    return jeton, session


async def fermer_sessions(
    db: AsyncSession, utilisateur_id: uuid.UUID, sauf: SessionUtilisateur | None = None
) -> None:
    """Déconnecte l'utilisateur partout, sauf éventuellement de la session indiquée."""
    requete = delete(SessionUtilisateur).where(SessionUtilisateur.utilisateur_id == utilisateur_id)
    if sauf is not None:
        requete = requete.where(SessionUtilisateur.empreinte != sauf.empreinte)
    await db.execute(requete)
