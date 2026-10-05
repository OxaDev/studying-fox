import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.modeles import ActionJournal


def journaliser(
    db: AsyncSession, acteur_id: uuid.UUID | None, action: str, cible: str, **details: str
) -> None:
    """Ajoute une action sensible au journal. Enregistrée avec le reste de la transaction."""
    db.add(ActionJournal(acteur_id=acteur_id, action=action, cible=cible, details=details))
