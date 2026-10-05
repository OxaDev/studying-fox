import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Import(Base):
    """Un paquet de leçons importé (ADR 0019)."""

    __tablename__ = "import"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    importateur_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("utilisateur.id", ondelete="SET NULL"), index=True
    )
    nom_fichier: Mapped[str] = mapped_column(String(255))
    nb_lecons: Mapped[int]
    assiste_par_ia: Mapped[bool] = mapped_column(default=False, server_default=text("false"))
    outil: Mapped[str | None] = mapped_column(String(100))
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
