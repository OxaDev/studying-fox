"""Leçons et révisions (ADR 0006). Une leçon pointe vers sa révision publiée."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    ARRAY,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, enum_pg


class Niveau(enum.StrEnum):
    DEBUTANT = "debutant"
    INTERMEDIAIRE = "intermediaire"


class StatutRevision(enum.StrEnum):
    """Statuts du circuit de relecture (ADR 0010)."""

    BROUILLON = "brouillon"
    EN_RELECTURE = "en_relecture"
    A_CORRIGER = "a_corriger"
    PUBLIEE = "publiee"
    REFUSEE = "refusee"


class Theme(Base):
    __tablename__ = "theme"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    nom: Mapped[str] = mapped_column(String(100))


class Lecon(Base):
    __tablename__ = "lecon"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    theme_id: Mapped[int] = mapped_column(ForeignKey("theme.id"), index=True)
    niveau: Mapped[Niveau] = mapped_column(enum_pg(Niveau, "niveau"))
    revision_publiee_id: Mapped[uuid.UUID | None] = mapped_column(
        # use_alter : lecon et revision se référencent mutuellement.
        ForeignKey("revision.id", ondelete="SET NULL", use_alter=True)
    )
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    theme: Mapped[Theme] = relationship(lazy="joined")
    revision_publiee: Mapped["Revision | None"] = relationship(
        foreign_keys=[revision_publiee_id], lazy="joined"
    )


class Revision(Base):
    """Une version d'une leçon. On ne modifie jamais le contenu d'une révision existante."""

    __tablename__ = "revision"
    __table_args__ = (
        UniqueConstraint("lecon_id", "numero"),
        Index("ix_revision_recherche", "recherche", postgresql_using="gin"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    lecon_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lecon.id", ondelete="CASCADE"))
    numero: Mapped[int]
    titre: Mapped[str] = mapped_column(String(100))
    resume: Mapped[str] = mapped_column(String(300))
    objectifs: Mapped[list[str]] = mapped_column(ARRAY(String(150)))
    duree_minutes: Mapped[int]
    contenu: Mapped[str] = mapped_column(Text)
    statut: Mapped[StatutRevision] = mapped_column(
        enum_pg(StatutRevision, "statut_revision"),
        default=StatutRevision.BROUILLON,
        server_default="brouillon",
    )
    # Vide si l'auteur a supprimé son compte : il apparaît alors comme « contributeur anonyme ».
    auteur_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("utilisateur.id", ondelete="SET NULL"), index=True
    )
    assiste_par_ia: Mapped[bool] = mapped_column(default=False, server_default=text("false"))
    # Renseigné si la révision vient d'un import (ADR 0019).
    import_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("import.id", ondelete="SET NULL"), index=True
    )
    publiee_le: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Un brouillon est modifiable jusqu'à sa soumission (ADR 0022).
    modifiee_le: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    # Index plein texte, tenu à jour par PostgreSQL (ADR 0007). Le titre pèse le plus.
    recherche: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed(
            "setweight(to_tsvector('francais', titre), 'A')"
            " || setweight(to_tsvector('francais', resume), 'B')"
            " || setweight(to_tsvector('francais', contenu), 'D')",
            persisted=True,
        ),
        deferred=True,
    )
