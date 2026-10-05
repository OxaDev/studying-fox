"""Recherche plein texte en français (jalon 6, ADR 0007).

Révision : 0006
Précédente : 0005
Créée le : 2026-10-05 15:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

VECTEUR_REVISION = (
    "setweight(to_tsvector('francais', titre), 'A')"
    " || setweight(to_tsvector('francais', resume), 'B')"
    " || setweight(to_tsvector('francais', contenu), 'D')"
)
VECTEUR_PARCOURS = (
    "setweight(to_tsvector('francais', titre), 'A')"
    " || setweight(to_tsvector('francais', description), 'B')"
)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    # Le français de PostgreSQL, qui ignore en plus les accents : « reseau » trouve « réseau ».
    op.execute("CREATE TEXT SEARCH CONFIGURATION francais (COPY = french)")
    op.execute(
        "ALTER TEXT SEARCH CONFIGURATION francais"
        " ALTER MAPPING FOR hword, hword_part, word WITH unaccent, french_stem"
    )
    for table, vecteur in [("revision", VECTEUR_REVISION), ("parcours", VECTEUR_PARCOURS)]:
        op.add_column(
            table,
            sa.Column(
                "recherche",
                postgresql.TSVECTOR(),
                sa.Computed(vecteur, persisted=True),
                nullable=True,
            ),
        )
        op.create_index(f"ix_{table}_recherche", table, ["recherche"], postgresql_using="gin")


def downgrade() -> None:
    for table in ["parcours", "revision"]:
        op.drop_index(f"ix_{table}_recherche", table_name=table, postgresql_using="gin")
        op.drop_column(table, "recherche")
    op.execute("DROP TEXT SEARCH CONFIGURATION francais")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
    op.execute("DROP EXTENSION IF EXISTS unaccent")
