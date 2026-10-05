"""Parcours, étapes et leçons terminées (jalon 3).

Révision : 0003
Précédente : 0002
Créée le : 2026-10-05 11:27:23.887213
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "parcours",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("titre", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column(
            "niveau",
            postgresql.ENUM("debutant", "intermediaire", name="niveau", create_type=False),
            nullable=False,
        ),
        sa.Column("theme_id", sa.Integer(), nullable=False),
        sa.Column("publie", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "cree_le", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["theme_id"], ["theme.id"], name=op.f("fk_parcours_theme_id_theme")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_parcours")),
        sa.UniqueConstraint("slug", name=op.f("uq_parcours_slug")),
    )
    op.create_index(op.f("ix_parcours_theme_id"), "parcours", ["theme_id"], unique=False)
    op.create_table(
        "etape_parcours",
        sa.Column("parcours_id", sa.Uuid(), nullable=False),
        sa.Column("lecon_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["lecon_id"],
            ["lecon.id"],
            name=op.f("fk_etape_parcours_lecon_id_lecon"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["parcours_id"],
            ["parcours.id"],
            name=op.f("fk_etape_parcours_parcours_id_parcours"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("parcours_id", "lecon_id", name=op.f("pk_etape_parcours")),
        sa.UniqueConstraint("parcours_id", "position", name=op.f("uq_etape_parcours_parcours_id")),
    )
    op.create_index(
        op.f("ix_etape_parcours_lecon_id"), "etape_parcours", ["lecon_id"], unique=False
    )
    op.create_table(
        "lecon_terminee",
        sa.Column("utilisateur_id", sa.Uuid(), nullable=False),
        sa.Column("lecon_id", sa.Uuid(), nullable=False),
        sa.Column(
            "terminee_le",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["lecon_id"],
            ["lecon.id"],
            name=op.f("fk_lecon_terminee_lecon_id_lecon"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["utilisateur_id"],
            ["utilisateur.id"],
            name=op.f("fk_lecon_terminee_utilisateur_id_utilisateur"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("utilisateur_id", "lecon_id", name=op.f("pk_lecon_terminee")),
    )
    op.create_index(
        op.f("ix_lecon_terminee_lecon_id"), "lecon_terminee", ["lecon_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_lecon_terminee_lecon_id"), table_name="lecon_terminee")
    op.drop_table("lecon_terminee")
    op.drop_index(op.f("ix_etape_parcours_lecon_id"), table_name="etape_parcours")
    op.drop_table("etape_parcours")
    op.drop_index(op.f("ix_parcours_theme_id"), table_name="parcours")
    op.drop_table("parcours")
