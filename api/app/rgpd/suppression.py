"""Suppression d'un compte (ADR 0014).

Les versions publiées restent en ligne : leur auteur devient « Contributeur anonyme »
(la clé étrangère passe à NULL). Tout ce qui n'a jamais été publié disparaît avec le compte.
"""

from sqlalchemy import delete, exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.comptes.modeles import Utilisateur
from app.lecons.modeles import Lecon, Revision, StatutRevision


async def supprimer_compte(db: AsyncSession, utilisateur: Utilisateur) -> None:
    """Supprime le compte et ses contenus non publiés. Ne valide pas la transaction."""
    lecons_touchees = set(
        await db.scalars(
            delete(Revision)
            .where(
                Revision.auteur_id == utilisateur.id,
                Revision.statut != StatutRevision.PUBLIEE,
            )
            .returning(Revision.lecon_id)
        )
    )
    if lecons_touchees:
        # Une leçon qui n'a plus aucune version disparaît (comme pour un brouillon supprimé).
        await db.execute(
            delete(Lecon).where(
                Lecon.id.in_(lecons_touchees),
                ~exists(select(Revision.id).where(Revision.lecon_id == Lecon.id)),
            )
        )
    # Sessions, jetons et progression partent en cascade ; le reste devient anonyme.
    await db.delete(utilisateur)
    await db.flush()
