"""Dépendances FastAPI : utilisateur connecté, jeton CSRF et rôles (ADR 0008, 0010)."""

import hmac
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.comptes.modeles import Role, SessionUtilisateur, Utilisateur
from app.comptes.securite import empreinte
from app.db import get_session
from app.protection import EN_TETE_CSRF
from app.temps import maintenant

COOKIE_SESSION = "renard_session"

Db = Annotated[AsyncSession, Depends(get_session)]


@dataclass
class Connecte:
    session: SessionUtilisateur
    utilisateur: Utilisateur


async def _connecte(request: Request, db: Db) -> Connecte:
    jeton = request.cookies.get(COOKIE_SESSION)
    session = await db.get(SessionUtilisateur, empreinte(jeton)) if jeton else None
    if session is None or session.expire_le <= maintenant() or session.utilisateur.suspendu:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion requise.")
    return Connecte(session=session, utilisateur=session.utilisateur)


async def _connecte_avec_csrf(
    request: Request, connecte: Annotated[Connecte, Depends(_connecte)]
) -> Connecte:
    recu = request.headers.get(EN_TETE_CSRF, "").encode()
    if not hmac.compare_digest(recu, connecte.session.jeton_csrf.encode()):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Jeton CSRF manquant ou invalide.")
    return connecte


# Pour les routes de lecture.
Lecture = Annotated[Connecte, Depends(_connecte)]
# Pour les routes qui modifient des données : le jeton CSRF est vérifié en plus.
Ecriture = Annotated[Connecte, Depends(_connecte_avec_csrf)]


def exiger_role(role: Role) -> Callable[[Connecte], Awaitable[Connecte]]:
    """Dépendance qui refuse l'accès sous le rôle demandé."""

    async def verifier(connecte: Lecture) -> Connecte:
        if not connecte.utilisateur.role.couvre(role):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Accès réservé.")
        return connecte

    return verifier
