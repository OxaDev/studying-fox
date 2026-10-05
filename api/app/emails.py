"""Envoi d'emails.

Le service d'envoi n'est pas encore choisi (question ouverte du cadrage) :
en attendant, les emails sont écrits dans les logs de l'API.
"""

import logging
from dataclasses import dataclass
from typing import Protocol

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Email:
    destinataire: str
    sujet: str
    corps: str


class Expediteur(Protocol):
    async def envoyer(self, email: Email) -> None: ...


class ExpediteurJournal:
    async def envoyer(self, email: Email) -> None:
        logger.info("Email pour %s — %s\n%s", email.destinataire, email.sujet, email.corps)


class ExpediteurMemoire:
    """Garde les emails en mémoire. Utilisé par les tests."""

    def __init__(self) -> None:
        self.envoyes: list[Email] = []

    async def envoyer(self, email: Email) -> None:
        self.envoyes.append(email)


_expediteur = ExpediteurJournal()


def get_expediteur() -> Expediteur:
    return _expediteur
