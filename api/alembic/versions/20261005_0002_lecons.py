"""Thèmes, leçons et révisions (jalon 2).

Révision : 0002
Précédente : 0001
Créée le : 2026-10-05 11:09:34.025629
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "theme",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("nom", sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_theme")),
        sa.UniqueConstraint("slug", name=op.f("uq_theme_slug")),
    )
    op.create_table(
        "lecon",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("theme_id", sa.Integer(), nullable=False),
        sa.Column("niveau", sa.Enum("debutant", "intermediaire", name="niveau"), nullable=False),
        sa.Column("revision_publiee_id", sa.Uuid(), nullable=True),
        sa.Column(
            "cree_le", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["theme_id"], ["theme.id"], name=op.f("fk_lecon_theme_id_theme")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_lecon")),
        sa.UniqueConstraint("slug", name=op.f("uq_lecon_slug")),
    )
    op.create_index(op.f("ix_lecon_theme_id"), "lecon", ["theme_id"], unique=False)
    op.create_table(
        "revision",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("lecon_id", sa.Uuid(), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("titre", sa.String(length=100), nullable=False),
        sa.Column("resume", sa.String(length=300), nullable=False),
        sa.Column("objectifs", sa.ARRAY(sa.String(length=150)), nullable=False),
        sa.Column("duree_minutes", sa.Integer(), nullable=False),
        sa.Column("contenu", sa.Text(), nullable=False),
        sa.Column(
            "statut",
            sa.Enum(
                "brouillon",
                "en_relecture",
                "a_corriger",
                "publiee",
                "refusee",
                name="statut_revision",
            ),
            server_default="brouillon",
            nullable=False,
        ),
        sa.Column("auteur_id", sa.Uuid(), nullable=True),
        sa.Column("assiste_par_ia", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("publiee_le", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "cree_le", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["auteur_id"],
            ["utilisateur.id"],
            name=op.f("fk_revision_auteur_id_utilisateur"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["lecon_id"], ["lecon.id"], name=op.f("fk_revision_lecon_id_lecon"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_revision")),
        sa.UniqueConstraint("lecon_id", "numero", name=op.f("uq_revision_lecon_id")),
    )
    op.create_index(op.f("ix_revision_auteur_id"), "revision", ["auteur_id"], unique=False)
    # Ajoutée après coup : lecon et revision se référencent mutuellement.
    op.create_foreign_key(
        op.f("fk_lecon_revision_publiee_id_revision"),
        "lecon",
        "revision",
        ["revision_publiee_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_lecon_revision_publiee_id_revision"), "lecon", type_="foreignkey")
    op.drop_index(op.f("ix_revision_auteur_id"), table_name="revision")
    op.drop_table("revision")
    op.drop_index(op.f("ix_lecon_theme_id"), table_name="lecon")
    op.drop_table("lecon")
    op.drop_table("theme")
    sa.Enum(name="statut_revision").drop(op.get_bind())
    sa.Enum(name="niveau").drop(op.get_bind())
