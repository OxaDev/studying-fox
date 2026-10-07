"""Parcours : suites ordonnées de leçons (cadrage § 5.2)."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Computed,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, enum_pg
from app.lecons.modeles import Lecon, Niveau, Theme


class Parcours(Base):
    __tablename__ = "parcours"
    __table_args__ = (Index("ix_parcours_recherche", "recherche", postgresql_using="gin"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    titre: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(500))
    niveau: Mapped[Niveau] = mapped_column(enum_pg(Niveau, "niveau"))
    theme_id: Mapped[int] = mapped_column(ForeignKey("theme.id"), index=True)
    # Place du parcours dans son thème, dans l'ordre d'apprentissage (ADR 0030).
    ordre: Mapped[int | None]
    publie: Mapped[bool] = mapped_column(default=False, server_default=text("false"))
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Index plein texte, tenu à jour par PostgreSQL (ADR 0007).
    recherche: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed(
            "setweight(to_tsvector('francais', titre), 'A')"
            " || setweight(to_tsvector('francais', description), 'B')",
            persisted=True,
        ),
        deferred=True,
    )

    theme: Mapped[Theme] = relationship(lazy="joined")
    etapes: Mapped[list["EtapeParcours"]] = relationship(
        order_by="EtapeParcours.position",
        lazy="selectin",
        cascade="all, delete-orphan",
    )


class EtapeParcours(Base):
    """Place d'une leçon dans un parcours. Une leçon peut appartenir à plusieurs parcours."""

    __tablename__ = "etape_parcours"
    __table_args__ = (UniqueConstraint("parcours_id", "position"),)

    parcours_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("parcours.id", ondelete="CASCADE"), primary_key=True
    )
    lecon_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lecon.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    position: Mapped[int]

    lecon: Mapped[Lecon] = relationship(lazy="joined")
