"""Imports, relectures et thèmes de départ (jalon 4).

Révision : 0004
Précédente : 0003
Créée le : 2026-10-05 11:41:59.237891
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "import",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("importateur_id", sa.Uuid(), nullable=True),
        sa.Column("nom_fichier", sa.String(length=255), nullable=False),
        sa.Column("nb_lecons", sa.Integer(), nullable=False),
        sa.Column("assiste_par_ia", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("outil", sa.String(length=100), nullable=True),
        sa.Column(
            "cree_le", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["importateur_id"],
            ["utilisateur.id"],
            name=op.f("fk_import_importateur_id_utilisateur"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_import")),
    )
    op.create_index(op.f("ix_import_importateur_id"), "import", ["importateur_id"], unique=False)
    op.create_table(
        "relecture",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("revision_id", sa.Uuid(), nullable=False),
        sa.Column("relecteur_id", sa.Uuid(), nullable=True),
        sa.Column(
            "decision", sa.Enum("publier", "corriger", "refuser", name="decision"), nullable=False
        ),
        sa.Column("commentaire", sa.Text(), nullable=True),
        sa.Column(
            "cree_le", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["relecteur_id"],
            ["utilisateur.id"],
            name=op.f("fk_relecture_relecteur_id_utilisateur"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["revision_id"],
            ["revision.id"],
            name=op.f("fk_relecture_revision_id_revision"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_relecture")),
    )
    op.create_index(op.f("ix_relecture_revision_id"), "relecture", ["revision_id"], unique=False)
    op.add_column("revision", sa.Column("import_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_revision_import_id"), "revision", ["import_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_revision_import_id_import"),
        "revision",
        "import",
        ["import_id"],
        ["id"],
        ondelete="SET NULL",
    )
    # Thèmes de départ : un import exige que ses thèmes existent (ADR 0019).
    op.execute(
        "INSERT INTO theme (slug, nom) VALUES ('python', 'Python'), ('javascript', 'JavaScript') "
        "ON CONFLICT (slug) DO NOTHING"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_revision_import_id_import"), "revision", type_="foreignkey")
    op.drop_index(op.f("ix_revision_import_id"), table_name="revision")
    op.drop_column("revision", "import_id")
    op.drop_index(op.f("ix_relecture_revision_id"), table_name="relecture")
    op.drop_table("relecture")
    op.drop_index(op.f("ix_import_importateur_id"), table_name="import")
    op.drop_table("import")
    sa.Enum(name="decision").drop(op.get_bind())
