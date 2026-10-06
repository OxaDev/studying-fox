"""Nouveaux thèmes : Python (bases, POO, Django, suite FastAPI) et VBA (bases).

Migration de données : les thèmes « python » et « vba » sont renommés, trois thèmes sont
créés, et les leçons et parcours validés (api/validated_courses/) y sont rattachés par leur id.
Les autres contenus de « python » restent dans « python-bases ».

Révision : 0007
Précédente : 0006
Créée le : 2026-10-06 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RENOMMAGES = [
    ("python", "Python", "python-bases", "Python - Bases"),
    ("vba", "VBA", "vba-bases", "VBA - Bases"),
]
NOUVEAUX = {
    "python-bases": "Python - Bases",
    "python-poo": "Python - Programmation Orientée Objet",
    "python-django": "Python - Django",
    "python-fastapi": "Python - Suite FastAPI",
    "vba-bases": "VBA - Bases",
}
# Les leçons et parcours validés qui changent de thème, par thème d'arrivée.
CONTENUS: dict[str, tuple[list[str], list[str]]] = {
    "python-poo": (
        # leçons
        [
            "4471ae93-695d-4a76-b012-8b3ae22bb738",
            "8b502281-331b-4ac4-9653-0470d4957e47",
            "132e4558-2db6-469e-a848-688f05d2cf8e",
            "8be0cf2e-95e0-435d-9bdd-ca639e22ac4d",
            "e086c878-6c92-495e-b30e-4e5a21faa86b",
            "7c438a9f-30ad-43a2-b1ac-2d5188282360",
            "bb354727-4e1c-4954-8d06-b89c584694bd",
            "8f175a07-5f12-454a-b912-1eb06fa149ce",
            "00bc709d-c2be-4000-bc8c-75d09b54639e",
            "e61b4538-17a4-4feb-9a48-06956da61443",
            "fa0f4410-fe6b-40bc-9711-5d68b15f15ba",
            "ea6bcf39-93a4-436d-926d-71bbee7944a6",
            "46eeb477-d0ce-48a7-a4a4-d3f30d24ffa8",
            "d2f54374-7d8a-4c05-9b62-561f53626811",
            "5ba403b4-ab4a-4a7c-baa9-e037303f5dd7",
            "4db5c8e6-1362-48ee-b96d-f415eb14df30",
            "7ace1997-02d0-413a-ae6c-1ab5548bda3d",
            "fe62fd56-c554-4d66-9cb4-7b30ec401c5d",
            "dc372ef2-7df1-4a42-8f43-e8872417c157",
            "81ea0e65-c043-4646-b7ad-cb15c7b22c67",
            "09b7b280-25b5-4c85-8775-e3ddb58f1d77",
            "41ba689d-8c0a-4582-a4dc-8a2d45f15838",
            "09bc8316-3e10-4de6-a77e-d419befc8bf4",
            "28e1296d-a521-4984-871f-07605d95c857",
            "3fe6544b-159d-4c52-bd19-565bb92cf62c",
            "faf4bfd9-c0bd-4734-9a27-ca4b35c38bec",
            "c4b6e374-c08d-46fe-8692-5d6417f0a69e",
            "83cbd566-7ffe-431a-adcf-e95e14832425",
            "7c730253-10cc-45e9-b4f6-8057487200ed",
            "b20fa846-92ee-41be-9a12-7d9b1fe1573a",
            "fb8d03f9-613d-4d8b-b859-d55333bbae2b",
            "a2bc2dcf-ea89-4b82-87ce-2559e38a8536",
            "5c9681a6-07af-40fa-84fd-90291f6c754e",
            "b4e98f03-5dc3-459d-a131-58c465dd35d1",
        ],
        # parcours
        [
            "ebade91d-a79f-4e5a-95dd-0fd34c25df4e",
            "6cd76f94-3375-48b9-97eb-e5b1984f47e8",
            "0ac61b9b-1691-4ad5-a1ef-bbd6bf186845",
        ],
    ),
    "python-django": (
        # leçons
        [
            "dcdfbcc7-3449-49d5-962a-e42b68e5addc",
            "68609d1c-c30d-43b6-a8b9-257ac17f2e1d",
            "632eb280-df12-43a1-84b1-aab03fa03959",
            "d3b58538-d647-4a0f-85b5-2e25c7649633",
            "897263c6-2e8b-4333-8983-81cb718c04ab",
            "adfce87f-83e6-4c60-9987-418daa06b0fe",
            "d4eb3957-99ba-4a76-95a1-22a75a85ea1f",
            "66848711-4e8e-410b-901e-964420888b1d",
            "c736ba9d-0624-4f2a-be3b-a5e8f18bfb25",
            "514f4d07-b088-4c6a-8ff3-e122092c8f14",
            "7c9e53e9-2c6c-43ba-9d3c-d908b9cd5eaa",
            "1221845c-8b45-4ad3-8fe2-7942462d3678",
            "7ed0eada-1aca-4766-adb2-97571cac1eeb",
            "77d1359b-546d-425a-a838-54458b7c7262",
            "d3d77cd6-d4ec-4c55-ac17-054005f3ed2e",
            "1de91ef2-86bf-4e4d-b16c-779537e933a7",
            "f3181698-8c9e-4c54-95d6-457baac63735",
            "6fb71b0a-ff77-4d95-b6f4-fd0b1c277f25",
            "24586c5e-eb0b-401a-aee8-f5f017a5b957",
            "e1a215b5-c2d6-4d86-b32e-fb2e0c9c46d7",
            "64c84c60-88db-4035-838a-1f6140f9182f",
            "9d87b986-5ed6-4b61-870c-1e55aed6acfe",
            "aa7ae407-b3f0-4bda-a622-c6e9f512de88",
            "054a941e-53be-4029-9003-0f3066a356b2",
            "02f2f5a5-d5fc-4df5-ba3d-75e7f4ca637e",
            "504de82d-2c24-4440-87a7-5a63afe32de4",
            "cf836ff3-0f8d-4596-b698-37c5f3171fbc",
            "55e208eb-8e88-470b-a6de-2f2a397869eb",
            "148550b4-5b87-4eb7-9b1b-25b9cf25705a",
            "eb502b21-4ef9-466e-9770-109aea6035c6",
            "7aaacfe3-b303-40ee-9bcb-628492284da0",
            "668c8147-7e08-4efd-af91-6d33b4f1e311",
        ],
        # parcours
        [
            "7a842543-25de-4682-952e-fd611911f237",
            "89cd3e38-dcab-4c40-84a1-8b70cc42253f",
            "edbb5c1b-f07f-4050-a024-700c475be90e",
            "1b507abb-a850-4b77-b68d-02cd12450b5d",
        ],
    ),
    "python-fastapi": (
        # leçons
        [
            "7b7f0b31-0c51-45f5-898c-effa3c876c89",
            "1c66ff05-18bb-4d1f-b389-004a443944f8",
            "4910b5cb-e6b9-40f9-bebe-7e8e1da13d18",
            "0cc599e9-a665-438e-a847-9a8c887ae8b5",
            "bc5bb427-2d85-458b-99e8-0590b8b16737",
            "c663653e-d221-426d-8cd2-9ab9ce53bbce",
            "6fd85a57-77f4-4a8a-84bd-1dbcb965e18c",
            "c6241bde-13e3-42c0-80cd-7578a3cc2210",
            "746df561-55b7-4af7-9518-34f76871f70d",
            "96f7da6f-d747-43fb-8991-e466a2bf8bb0",
            "6df85241-0b6c-4115-8a76-f33c61934fc2",
            "b8cf3524-ba29-4dbf-8cf0-d1aa8baff6a8",
            "2ef73427-92c2-4ca9-9663-f261d45bc1cc",
            "1bb716e7-a5d5-48af-8fa9-e22acf219a89",
            "c7ff87e0-4558-4996-a309-2b8bfa06633d",
            "fc4985d4-5809-4833-9d78-57729c959fd7",
            "d1a13280-f275-462f-9553-b22fc36650a2",
            "60000f9c-2a25-4b75-8ccd-da68e0c43dcc",
            "9d3254ac-9c01-4dcd-90e5-70cfa77ea226",
            "8e2031e2-63db-491f-8ff7-e396b3fc386d",
            "7695d8a1-9d85-42c4-a88f-d283584d486a",
            "ca109398-5565-462f-a252-28b464af4067",
            "299e4e86-b0b1-4287-a471-68afdb5c0b63",
            "15dfd7d9-7041-48ae-890b-5bde73083b26",
            "47970b2f-b93c-4e8b-ba67-47c8e2701ca4",
            "2fd86c3f-e439-434a-993f-8cd827741571",
            "021df49c-a9ca-48de-ac9c-94165ec3c992",
            "6ebe0dc0-dfd5-445a-9b57-e20118bc747c",
            "fb97b970-6032-4d50-b51e-b7b14eda09ac",
            "26323047-9950-4a0e-bd41-8cea9255776b",
            "e423b9b1-4d0b-4a77-8786-beb48d7d9ed1",
            "44b474a0-f9eb-4200-a542-17f3a6f35cc9",
            "fefabcad-6c76-415e-a835-f07c26b36c11",
            "b1e191f1-bbb7-448b-ad48-8a940a976559",
            "abe42bb3-77ed-4297-8c24-be61883511fc",
            "59ab9efc-b68e-4e40-9c6e-bd6c7ce2e4e9",
            "204b00a3-fe07-4fb6-b73c-8e04a8e044e4",
            "bd1f36cd-c67c-49bd-943d-f70cd8a806c9",
            "bf29ef91-ce41-4554-b9f5-921c8811346e",
            "a47b2fdd-430e-410c-80bb-1e7ea54efeed",
            "c7b08041-3d90-4913-801c-12126ee15cd8",
            "191bcb70-feef-4995-bc75-a25a7424e894",
            "e8e88d60-ed67-44ac-b06b-bec5b276bf60",
            "629fa207-dfe7-421f-89de-5656eb0b8b07",
            "e943ad46-d937-4cff-b5d6-826b7c0decd1",
            "512ff7a0-34d5-4fdb-8c1e-dda57b17d29e",
            "467d91a8-2064-41cd-9397-fdb484322b0b",
            "e58385fa-b922-4dc0-9fd7-17af21876e3a",
            "e426e8e7-cdc0-4a4e-a30c-79a3e6073c71",
        ],
        # parcours
        [
            "7b505d7e-f2e5-448e-a906-45be04372d9c",
            "5348c45c-4b47-4837-af6a-a7a8cab999fd",
            "a0d8bd8f-2634-4586-ad79-cac212fb8d33",
            "16d9689e-cabd-46d9-94a7-e68c876c063c",
            "12b70847-7e08-463a-8748-7122c83dba7e",
            "1ba9f7b8-9696-4fec-8fd2-483fa4f731ed",
        ],
    ),
}


THEME = sa.table("theme", sa.column("id"), sa.column("slug"))
TABLES = [sa.table(nom, sa.column("id"), sa.column("theme_id")) for nom in ("lecon", "parcours")]


def _rattacher(theme: str, lecons: list[str], parcours: list[str]) -> None:
    theme_id = sa.select(THEME.c.id).where(THEME.c.slug == theme).scalar_subquery()
    for table, ids in zip(TABLES, (lecons, parcours), strict=True):
        op.execute(
            table.update().where(sa.cast(table.c.id, sa.Text).in_(ids)).values(theme_id=theme_id)
        )


def _fusionner(ancien: str, nouveau: str, nom: str) -> None:
    """Renomme le thème. S'il existe déjà sous son nouveau nom (créé au démarrage de l'API
    avant la migration), y déplace le contenu de l'ancien, puis supprime l'ancien."""
    op.execute(
        sa.text(
            "UPDATE theme SET slug = :nouveau, nom = :nom WHERE slug = :ancien "
            "AND NOT EXISTS (SELECT 1 FROM theme WHERE slug = :nouveau)"
        ).bindparams(ancien=ancien, nouveau=nouveau, nom=nom)
    )
    vers = sa.select(THEME.c.id).where(THEME.c.slug == nouveau).scalar_subquery()
    depuis = sa.select(THEME.c.id).where(THEME.c.slug == ancien).scalar_subquery()
    for table in TABLES:
        op.execute(table.update().where(table.c.theme_id == depuis).values(theme_id=vers))
    op.execute(sa.text("DELETE FROM theme WHERE slug = :ancien").bindparams(ancien=ancien))


def upgrade() -> None:
    for ancien, _, nouveau, nom in RENOMMAGES:
        _fusionner(ancien, nouveau, nom)
    for slug, nom in NOUVEAUX.items():
        op.execute(
            sa.text(
                "INSERT INTO theme (slug, nom) SELECT :slug, :nom "
                "WHERE NOT EXISTS (SELECT 1 FROM theme WHERE slug = :slug)"
            ).bindparams(slug=slug, nom=nom)
        )
    for theme, (lecons, parcours) in CONTENUS.items():
        _rattacher(theme, lecons, parcours)


def downgrade() -> None:
    for lecons, parcours in CONTENUS.values():
        _rattacher("python-bases", lecons, parcours)
    for slug in CONTENUS:
        op.execute(sa.text("DELETE FROM theme WHERE slug = :slug").bindparams(slug=slug))
    for ancien, nom, nouveau, _ in RENOMMAGES:
        _fusionner(nouveau, ancien, nom)
