"""Ordre des parcours dans leur thème (ADR 0030).

Ajoute la colonne « ordre » aux parcours, et la remplit pour les parcours validés
(api/validated_courses/) déjà en base : leur chargement au démarrage ne les modifie plus.

Révision : 0008
Précédente : 0007
Créée le : 2026-10-07 22:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Les parcours validés, thème par thème, dans l'ordre d'apprentissage.
ORDRES: dict[str, list[str]] = {
    "python-bases": [
        "919174c3-a97d-4ab3-b694-9a0b5539bd3a",  # Les fondamentaux de Python
    ],
    "python-poo": [
        "ebade91d-a79f-4e5a-95dd-0fd34c25df4e",  # La programmation objet en Python
        "0ac61b9b-1691-4ad5-a1ef-bbd6bf186845",  # Les principes SOLID en Python
        "6cd76f94-3375-48b9-97eb-e5b1984f47e8",  # Design patterns en Python
    ],
    "python-django": [
        "7a842543-25de-4682-952e-fd611911f237",  # Django : les bases
        "edbb5c1b-f07f-4050-a024-700c475be90e",  # Django REST Framework : les bases
        "89cd3e38-dcab-4c40-84a1-8b70cc42253f",  # Django : niveau intermédiaire
        "1b507abb-a850-4b77-b68d-02cd12450b5d",  # Django REST Framework : intermédiaire
    ],
    "python-fastapi": [
        "7b505d7e-f2e5-448e-a906-45be04372d9c",  # FastAPI : les bases
        "a0d8bd8f-2634-4586-ad79-cac212fb8d33",  # SQLAlchemy : les bases
        "12b70847-7e08-463a-8748-7122c83dba7e",  # Alembic : les bases
        "5348c45c-4b47-4837-af6a-a7a8cab999fd",  # FastAPI : niveau intermédiaire
        "16d9689e-cabd-46d9-94a7-e68c876c063c",  # SQLAlchemy : niveau intermédiaire
        "1ba9f7b8-9696-4fec-8fd2-483fa4f731ed",  # Alembic : niveau intermédiaire
    ],
    "vba-bases": [
        "311004f1-e9d5-48ac-a31c-301251175a97",  # Automatiser Excel avec VBA
    ],
    "daggerheart": [
        "c0567eab-fbf2-4e32-a385-48db85b8d7c2",  # Découvrir le jeu
        "fa73d6d4-69c4-4b6f-bb60-f5e48a7839aa",  # Créer son personnage
        "ad4178ee-b97e-4021-a15e-d6bdc25331c9",  # Combat, blessures et repos
        "8a9a896b-8960-4053-b4d2-b549334f7520",  # Parties commentées
        "9f093763-3743-4240-9c93-855f811b95bc",  # Maîtriser : les fondamentaux
        "eebac076-1789-42db-b99f-a10b2d74ddc3",  # Maîtriser : adversaires et rencontres
        "88db2b05-382c-42ea-b257-2bceafeb72c0",  # Maîtriser : préparer et mener une aventure
    ],
}

PARCOURS = sa.table("parcours", sa.column("id"), sa.column("ordre"))


def upgrade() -> None:
    op.add_column("parcours", sa.Column("ordre", sa.Integer(), nullable=True))
    for ids in ORDRES.values():
        for ordre, identifiant in enumerate(ids, start=1):
            op.execute(
                PARCOURS.update()
                .where(sa.cast(PARCOURS.c.id, sa.Text) == identifiant)
                .values(ordre=ordre)
            )


def downgrade() -> None:
    op.drop_column("parcours", "ordre")
