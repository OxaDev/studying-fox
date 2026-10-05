import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, enum_pg


class Decision(enum.StrEnum):
    """Les trois décisions d'un relecteur (ADR 0010)."""

    PUBLIER = "publier"
    CORRIGER = "corriger"
    REFUSER = "refuser"


class Relecture(Base):
    """Décision prise sur une révision. Toutes les décisions sont gardées (historique)."""

    __tablename__ = "relecture"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    revision_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("revision.id", ondelete="CASCADE"), index=True
    )
    relecteur_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("utilisateur.id", ondelete="SET NULL")
    )
    decision: Mapped[Decision] = mapped_column(enum_pg(Decision, "decision"))
    commentaire: Mapped[str | None] = mapped_column(Text)
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
