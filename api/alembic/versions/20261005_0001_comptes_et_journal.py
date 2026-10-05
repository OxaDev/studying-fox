"""Comptes, sessions, jetons email et journal des actions (jalon 1).

Révision : 0001
Précédente :
Créée le : 2026-10-05 10:52:42.182171
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "utilisateur",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("pseudo", sa.String(length=30), nullable=False),
        sa.Column("mot_de_passe_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "role",
            sa.Enum("apprenant", "contributeur", "relecteur", "admin", name="role_utilisateur"),
            server_default="apprenant",
            nullable=False,
        ),
        sa.Column("email_verifie_le", sa.DateTime(timezone=True), nullable=True),
        sa.Column("licence_acceptee_le", sa.DateTime(timezone=True), nullable=True),
        sa.Column("suspendu", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "cree_le", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_utilisateur")),
        sa.UniqueConstraint("email", name=op.f("uq_utilisateur_email")),
    )
    op.create_index(
        "uq_utilisateur_pseudo", "utilisateur", [sa.literal_column("lower(pseudo)")], unique=True
    )
    op.create_table(
        "jeton_email",
        sa.Column("empreinte", sa.String(length=64), nullable=False),
        sa.Column("utilisateur_id", sa.Uuid(), nullable=False),
        sa.Column(
            "type",
            sa.Enum("confirmation", "reinitialisation", "changement_email", name="type_jeton"),
            nullable=False,
        ),
        sa.Column("nouvel_email", sa.String(length=254), nullable=True),
        sa.Column("expire_le", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["utilisateur_id"],
            ["utilisateur.id"],
            name=op.f("fk_jeton_email_utilisateur_id_utilisateur"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("empreinte", name=op.f("pk_jeton_email")),
    )
    op.create_index(
        op.f("ix_jeton_email_utilisateur_id"), "jeton_email", ["utilisateur_id"], unique=False
    )
    op.create_table(
        "journal_action",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("acteur_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("cible", sa.String(length=200), nullable=False),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "cree_le", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["acteur_id"],
            ["utilisateur.id"],
            name=op.f("fk_journal_action_acteur_id_utilisateur"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_journal_action")),
    )
    op.create_index(
        op.f("ix_journal_action_acteur_id"), "journal_action", ["acteur_id"], unique=False
    )
    op.create_table(
        "session_utilisateur",
        sa.Column("empreinte", sa.String(length=64), nullable=False),
        sa.Column("utilisateur_id", sa.Uuid(), nullable=False),
        sa.Column("jeton_csrf", sa.String(length=64), nullable=False),
        sa.Column(
            "cree_le", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("expire_le", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["utilisateur_id"],
            ["utilisateur.id"],
            name=op.f("fk_session_utilisateur_utilisateur_id_utilisateur"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("empreinte", name=op.f("pk_session_utilisateur")),
    )
    op.create_index(
        op.f("ix_session_utilisateur_utilisateur_id"),
        "session_utilisateur",
        ["utilisateur_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_session_utilisateur_utilisateur_id"), table_name="session_utilisateur")
    op.drop_table("session_utilisateur")
    op.drop_index(op.f("ix_journal_action_acteur_id"), table_name="journal_action")
    op.drop_table("journal_action")
    op.drop_index(op.f("ix_jeton_email_utilisateur_id"), table_name="jeton_email")
    op.drop_table("jeton_email")
    op.drop_index("uq_utilisateur_pseudo", table_name="utilisateur")
    op.drop_table("utilisateur")
    sa.Enum(name="type_jeton").drop(op.get_bind())
    sa.Enum(name="role_utilisateur").drop(op.get_bind())
