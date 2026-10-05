"""Date de dernière modification des révisions (jalon 5).

Révision : 0005
Précédente : 0004
Créée le : 2026-10-05 12:01:31.242701
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "revision",
        sa.Column(
            "modifiee_le",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("revision", "modifiee_le")
