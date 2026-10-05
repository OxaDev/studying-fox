import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class LeconTerminee(Base):
    """Une leçon qu'un apprenant a marquée comme terminée (cadrage § 5.3)."""

    __tablename__ = "lecon_terminee"

    utilisateur_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("utilisateur.id", ondelete="CASCADE"), primary_key=True
    )
    lecon_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lecon.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    terminee_le: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
