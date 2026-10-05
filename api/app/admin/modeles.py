import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ActionJournal(Base):
    """Trace d'une action sensible : publication, changement de rôle, suppression…"""

    __tablename__ = "journal_action"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Vide si l'action vient de la ligne de commande, ou si l'acteur a supprimé son compte.
    acteur_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("utilisateur.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[str] = mapped_column(String(50))
    cible: Mapped[str] = mapped_column(String(200))
    details: Mapped[dict[str, str]] = mapped_column(JSONB, default=dict)
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
