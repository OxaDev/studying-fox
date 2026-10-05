import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, enum_pg


class Role(enum.StrEnum):
    """Rôles du cadrage, du moins au plus élevé. Chaque rôle a les droits des précédents."""

    APPRENANT = "apprenant"
    CONTRIBUTEUR = "contributeur"
    RELECTEUR = "relecteur"
    ADMIN = "admin"

    def couvre(self, autre: "Role") -> bool:
        ordre = list(Role)
        return ordre.index(self) >= ordre.index(autre)


class TypeJeton(enum.StrEnum):
    CONFIRMATION = "confirmation"
    REINITIALISATION = "reinitialisation"
    CHANGEMENT_EMAIL = "changement_email"


class Utilisateur(Base):
    __tablename__ = "utilisateur"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    pseudo: Mapped[str] = mapped_column(String(30))
    mot_de_passe_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(
        enum_pg(Role, "role_utilisateur"), default=Role.APPRENANT, server_default="apprenant"
    )
    email_verifie_le: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    licence_acceptee_le: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    suspendu: Mapped[bool] = mapped_column(default=False, server_default=text("false"))
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# Deux pseudos ne peuvent différer seulement par la casse.
Index("uq_utilisateur_pseudo", func.lower(Utilisateur.pseudo), unique=True)


class SessionUtilisateur(Base):
    """Session ouverte à la connexion. Seule l'empreinte du jeton est stockée (ADR 0008)."""

    __tablename__ = "session_utilisateur"

    empreinte: Mapped[str] = mapped_column(String(64), primary_key=True)
    utilisateur_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("utilisateur.id", ondelete="CASCADE"), index=True
    )
    jeton_csrf: Mapped[str] = mapped_column(String(64))
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expire_le: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    utilisateur: Mapped[Utilisateur] = relationship(lazy="joined")


class JetonEmail(Base):
    """Jeton à usage unique envoyé par email : confirmation, réinitialisation, changement."""

    __tablename__ = "jeton_email"

    empreinte: Mapped[str] = mapped_column(String(64), primary_key=True)
    utilisateur_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("utilisateur.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[TypeJeton] = mapped_column(enum_pg(TypeJeton, "type_jeton"))
    nouvel_email: Mapped[str | None] = mapped_column(String(254))
    expire_le: Mapped[datetime] = mapped_column(DateTime(timezone=True))
