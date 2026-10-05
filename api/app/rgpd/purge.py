"""Durées de conservation (ADR 0014), appliquées chaque jour par l'API.

À la main : uv run python -m app.rgpd.purge
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.journal import journaliser
from app.admin.modeles import ActionJournal
from app.comptes.modeles import JetonEmail, SessionUtilisateur, Utilisateur
from app.config import get_config
from app.db import SessionLocale
from app.modeles import __all__ as _tous_les_modeles  # noqa: F401  (enregistre les tables)
from app.rgpd.suppression import supprimer_compte
from app.temps import maintenant

COMPTE_NON_CONFIRME = timedelta(days=30)
JOURNAL = timedelta(days=365)
INTERVALLE = timedelta(days=1)

journal_technique = logging.getLogger(__name__)


@dataclass
class Bilan:
    comptes: int
    sessions: int
    jetons: int
    actions: int


async def purger(db: AsyncSession, le: datetime) -> Bilan:
    """Supprime ce qui a dépassé sa durée de conservation, et valide la transaction."""
    comptes = []
    # Sans vérification de l'email, aucun compte n'est confirmé : on n'en supprime aucun (ADR 0023).
    if get_config().verification_email:
        comptes = list(
            await db.scalars(
                select(Utilisateur).where(
                    Utilisateur.email_verifie_le.is_(None),
                    Utilisateur.cree_le < le - COMPTE_NON_CONFIRME,
                )
            )
        )
    for compte in comptes:
        await supprimer_compte(db, compte)
    sessions = await db.execute(
        delete(SessionUtilisateur)
        .where(SessionUtilisateur.expire_le < le)
        .returning(SessionUtilisateur.empreinte)
    )
    jetons = await db.execute(
        delete(JetonEmail).where(JetonEmail.expire_le < le).returning(JetonEmail.empreinte)
    )
    actions = await db.execute(
        delete(ActionJournal)
        .where(ActionJournal.cree_le < le - JOURNAL)
        .returning(ActionJournal.id)
    )
    bilan = Bilan(
        comptes=len(comptes),
        sessions=len(sessions.all()),
        jetons=len(jetons.all()),
        actions=len(actions.all()),
    )
    if bilan.comptes:
        journaliser(db, None, "purge_comptes", "comptes non confirmés", nombre=str(bilan.comptes))
    await db.commit()
    return bilan


async def purger_chaque_jour() -> None:
    """Tâche de fond lancée au démarrage de l'API. Une erreur n'arrête pas les suivantes."""
    while True:
        try:
            async with SessionLocale() as db:
                bilan = await purger(db, maintenant())
            journal_technique.info("Purge : %s", bilan)
        except Exception:
            journal_technique.exception("La purge a échoué")
        await asyncio.sleep(INTERVALLE.total_seconds())


async def _purger_maintenant() -> None:
    async with SessionLocale() as db:
        print(await purger(db, maintenant()))


if __name__ == "__main__":
    asyncio.run(_purger_maintenant())
