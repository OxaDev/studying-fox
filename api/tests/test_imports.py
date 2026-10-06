import io
import json
import uuid
import zipfile
from pathlib import Path
from typing import cast

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select

from app.admin.modeles import ActionJournal
from app.comptes.modeles import Role
from app.config import get_config
from app.db import SessionLocale
from app.emails import ExpediteurMemoire
from app.lecons.modeles import Lecon, Revision, StatutRevision
from app.parcours.modeles import Parcours
from tests.outils import connecter, creer_compte, creer_lecon, creer_themes

EXEMPLE = Path(__file__).parents[2] / "docs" / "format-lecon" / "exemple.json"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32

type Paquet = dict[str, object]
type Fichier = tuple[str, bytes, str]


def exemple() -> Paquet:
    return cast(Paquet, json.loads(EXEMPLE.read_text(encoding="utf-8")))


def lecon(paquet: Paquet, index: int = 0) -> dict[str, object]:
    return cast(list[dict[str, object]], paquet["lecons"])[index]


def parcours(paquet: Paquet) -> dict[str, object]:
    return cast(dict[str, object], paquet["parcours"])


def en_version(paquet: Paquet, version: int) -> Paquet:
    """Ramène l'exemple à une version antérieure : les identifiants n'existent qu'en version 3."""
    paquet["version"] = version
    if version < 3:
        for element in [*cast(list[dict[str, object]], paquet["lecons"]), parcours(paquet)]:
            element.pop("id")
    return paquet


ID_LECON = uuid.UUID(str(lecon(exemple())["id"]))


def en_json(paquet: Paquet) -> Fichier:
    return ("paquet.json", json.dumps(paquet).encode(), "application/json")


def en_zip(paquet: Paquet, fichiers: dict[str, bytes] | None = None) -> Fichier:
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w") as archive:
        archive.writestr("lecons.json", json.dumps(paquet))
        for nom, contenu in (fichiers or {}).items():
            archive.writestr(nom, contenu)
    return ("paquet.zip", tampon.getvalue(), "application/zip")


def avec_image(paquet: Paquet) -> Paquet:
    blocs = cast(list[dict[str, object]], lecon(paquet)["blocs"])
    blocs.append(
        {
            "type": "image",
            "fichier": "images/schema.png",
            "alt": "Schéma d'une variable",
            "licence": "creation-originale",
        }
    )
    return paquet


@pytest.fixture
async def csrf(client: AsyncClient, boite_mail: ExpediteurMemoire) -> dict[str, str]:
    """Une relectrice connectée."""
    await creer_themes()
    compte = await creer_compte(client, boite_mail, pseudo="relectrice", role=Role.RELECTEUR)
    return await connecter(client, compte)


async def analyser(client: AsyncClient, csrf: dict[str, str], fichier: Fichier) -> Response:
    return await client.post("/api/imports/analyse", files={"fichier": fichier}, headers=csrf)


async def importer(client: AsyncClient, csrf: dict[str, str], fichier: Fichier) -> Response:
    return await client.post("/api/imports", files={"fichier": fichier}, headers=csrf)


# --- Accès -------------------------------------------------------------------------------


async def test_un_contributeur_ne_peut_pas_importer(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    compte = await creer_compte(client, boite_mail, role=Role.CONTRIBUTEUR)
    csrf = await connecter(client, compte)

    assert (await analyser(client, csrf, en_json(exemple()))).status_code == 403
    assert (await importer(client, csrf, en_json(exemple()))).status_code == 403


# --- Analyse -----------------------------------------------------------------------------


async def test_analyse_de_l_exemple(client: AsyncClient, csrf: dict[str, str]) -> None:
    reponse = await analyser(client, csrf, en_json(exemple()))

    analyse = reponse.json()
    assert analyse["valide"] is True
    assert analyse["erreurs"] == []
    assert [(x["slug"], x["action"]) for x in analyse["lecons"]] == [
        ("afficher-du-texte-en-python", "creation"),
        ("les-variables-en-python", "creation"),
    ]
    assert analyse["parcours"]["action"] == "creation"
    assert analyse["assiste_par_ia"] is True
    assert analyse["codes"][0] == {
        "lecon": "afficher-du-texte-en-python",
        "bloc": 2,
        "langage": "python",
        "code": 'print("Bonjour !")',
        "sortie_attendue": "Bonjour !\n",
        "solution": False,
    }


EXERCICE: dict[str, object] = {
    "type": "exercice",
    "langage": "python",
    "consigne": "Affiche le double de `n`.",
    "code": "n = 21\n# À toi de jouer\n",
    "solution": "n = 21\nprint(n * 2)\n",
    "sortie_attendue": "42\n",
}


async def test_un_exercice_demande_la_version_2(client: AsyncClient, csrf: dict[str, str]) -> None:
    paquet = en_version(exemple(), 1)
    cast(list[dict[str, object]], lecon(paquet)["blocs"]).append(EXERCICE)

    analyse = (await analyser(client, csrf, en_json(paquet))).json()

    assert analyse["valide"] is False
    assert analyse["erreurs"] == [
        {
            "emplacement": "Leçon « afficher-du-texte-en-python » › bloc 4",
            "message": "Le bloc « exercice » demande la version 2 du format.",
        }
    ]


async def test_seule_la_solution_d_un_exercice_est_verifiee(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    paquet = en_version(exemple(), 2)
    cast(list[dict[str, object]], lecon(paquet)["blocs"]).append(EXERCICE)

    analyse = (await analyser(client, csrf, en_json(paquet))).json()

    assert analyse["valide"] is True
    assert analyse["codes"][1] == {
        "lecon": "afficher-du-texte-en-python",
        "bloc": 4,
        "langage": "python",
        "code": "n = 21\nprint(n * 2)\n",
        "sortie_attendue": "42\n",
        "solution": True,
    }


async def test_un_exercice_importe_est_stocke_en_markdown(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    paquet = en_version(exemple(), 2)
    cast(list[dict[str, object]], lecon(paquet)["blocs"]).append(EXERCICE)

    assert (await importer(client, csrf, en_json(paquet))).status_code == 201
    async with SessionLocale() as db:
        contenus = list(await db.scalars(select(Revision.contenu)))

    assert any("> [!exercice]\n> Affiche le double de `n`." in c for c in contenus)


async def test_analyse_n_enregistre_rien(client: AsyncClient, csrf: dict[str, str]) -> None:
    await analyser(client, csrf, en_json(exemple()))

    assert (await client.get("/api/relecture")).json() == []


async def test_json_illisible(client: AsyncClient, csrf: dict[str, str]) -> None:
    reponse = await analyser(client, csrf, ("paquet.json", b"{pas du json", "application/json"))

    analyse = reponse.json()
    assert analyse["valide"] is False
    assert analyse["erreurs"][0]["message"].startswith("JSON invalide")


async def test_erreur_de_format_localisee_en_francais(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    paquet = exemple()
    blocs = cast(list[dict[str, object]], lecon(paquet)["blocs"])
    blocs[1]["langage"] = "rust"

    analyse = (await analyser(client, csrf, en_json(paquet))).json()

    assert analyse["valide"] is False
    assert analyse["erreurs"] == [
        {
            "emplacement": "Leçon « afficher-du-texte-en-python » › bloc 2 › langage",
            "message": "Valeur non autorisée. Attendu : 'python' ou 'javascript'.",
        }
    ]


async def test_theme_inconnu(client: AsyncClient, csrf: dict[str, str]) -> None:
    paquet = exemple()
    lecon(paquet)["theme"] = "rust"

    analyse = (await analyser(client, csrf, en_json(paquet))).json()

    assert analyse["valide"] is False
    assert "Thème inconnu" in analyse["erreurs"][0]["message"]


async def test_sans_identifiant_le_slug_designe_la_lecon(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    await creer_lecon("afficher-du-texte-en-python")

    analyse = (await analyser(client, csrf, en_json(en_version(exemple(), 2)))).json()

    assert analyse["lecons"][0]["action"] == "nouvelle_version"


# --- Identifiants (version 3, ADR 0025) ---------------------------------------------------


async def test_meme_identifiant_devient_une_nouvelle_version(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    await creer_lecon("afficher-du-texte-en-python", identifiant=ID_LECON)

    analyse = (await analyser(client, csrf, en_json(exemple()))).json()

    assert analyse["valide"] is True
    assert analyse["lecons"][0]["action"] == "nouvelle_version"


async def test_un_slug_pris_par_une_autre_lecon_est_refuse(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    await creer_lecon("afficher-du-texte-en-python")

    analyse = (await analyser(client, csrf, en_json(exemple()))).json()

    assert analyse["valide"] is False
    assert analyse["erreurs"] == [
        {
            "emplacement": "Leçon « afficher-du-texte-en-python »",
            "message": "Ce slug est déjà pris par une autre leçon du site.",
        }
    ]


async def test_le_slug_d_une_lecon_existante_ne_change_pas(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    await creer_lecon("ancien-slug", identifiant=ID_LECON)

    analyse = (await analyser(client, csrf, en_json(exemple()))).json()

    assert analyse["erreurs"] == [
        {
            "emplacement": "Leçon « afficher-du-texte-en-python »",
            "message": "Cette leçon existe sous le slug « ancien-slug » : il ne change pas.",
        }
    ]


async def test_l_identifiant_est_obligatoire_en_version_3(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    paquet = exemple()
    del parcours(paquet)["id"]

    analyse = (await analyser(client, csrf, en_json(paquet))).json()

    assert analyse["erreurs"] == [
        {
            "emplacement": "Parcours « premiers-pas-en-python » › id",
            "message": "Champ obligatoire à partir de la version 3 du format.",
        }
    ]


async def test_l_identifiant_demande_la_version_3(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    paquet = exemple()
    paquet["version"] = 2

    analyse = (await analyser(client, csrf, en_json(paquet))).json()

    assert analyse["valide"] is False
    assert {e["message"] for e in analyse["erreurs"]} == {
        "L'identifiant demande la version 3 du format."
    }


async def test_un_identifiant_en_double_est_refuse(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    paquet = exemple()
    lecon(paquet, 1)["id"] = lecon(paquet)["id"]

    analyse = (await analyser(client, csrf, en_json(paquet))).json()

    assert analyse["erreurs"] == [
        {
            "emplacement": "Leçon « les-variables-en-python » › id",
            "message": "Cet identifiant apparaît deux fois.",
        }
    ]


async def test_un_identifiant_mal_forme_est_explique(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    paquet = exemple()
    lecon(paquet)["id"] = "pas-un-uuid"

    analyse = (await analyser(client, csrf, en_json(paquet))).json()

    assert analyse["erreurs"][0]["emplacement"] == "Leçon « afficher-du-texte-en-python » › id"
    assert analyse["erreurs"][0]["message"].startswith("Doit être un UUID")


async def test_reimporter_le_meme_fichier_ne_cree_pas_de_doublon(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    assert (await importer(client, csrf, en_json(exemple()))).status_code == 201
    assert (await importer(client, csrf, en_json(exemple()))).status_code == 201

    async with SessionLocale() as db:
        lecons = list(await db.scalars(select(Lecon)))
        tous_les_parcours = list(await db.scalars(select(Parcours)))
        revisions = list(await db.scalars(select(Revision).where(Revision.lecon_id == ID_LECON)))
    attendues = cast(list[dict[str, object]], exemple()["lecons"])
    assert {e.id for e in lecons} == {uuid.UUID(str(e["id"])) for e in attendues}
    assert [p.id for p in tous_les_parcours] == [uuid.UUID(str(parcours(exemple())["id"]))]
    assert sorted(r.numero for r in revisions) == [1, 2]


async def test_mauvaise_extension(client: AsyncClient, csrf: dict[str, str]) -> None:
    analyse = (await analyser(client, csrf, ("paquet.txt", b"{}", "text/plain"))).json()

    assert analyse["erreurs"][0]["message"] == "Le fichier doit être un .json ou un .zip."


# --- Archives ZIP ------------------------------------------------------------------------


async def test_zip_avec_image(client: AsyncClient, csrf: dict[str, str]) -> None:
    fichier = en_zip(avec_image(exemple()), {"images/schema.png": PNG})

    analyse = (await analyser(client, csrf, fichier)).json()

    assert analyse["valide"] is True
    assert analyse["lecons"][0]["nb_images"] == 1


async def test_image_manquante(client: AsyncClient, csrf: dict[str, str]) -> None:
    analyse = (await analyser(client, csrf, en_zip(avec_image(exemple())))).json()

    assert analyse["erreurs"][0]["message"] == "Image absente de l'archive ZIP."


async def test_fichier_suspect_dans_l_archive(client: AsyncClient, csrf: dict[str, str]) -> None:
    fichier = en_zip(exemple(), {"../../etc/passwd": b"root", "images/script.png": b"<script>"})

    erreurs = (await analyser(client, csrf, fichier)).json()["erreurs"]

    assert {
        "emplacement": "../../etc/passwd",
        "message": "Fichier non autorisé dans l'archive.",
    } in erreurs
    assert {
        "emplacement": "images/script.png",
        "message": "Le contenu ne correspond pas à l'extension du fichier.",
    } in erreurs


# --- Import ------------------------------------------------------------------------------


async def test_import_cree_des_brouillons_invisibles_des_apprenants(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    reponse = await importer(client, csrf, en_json(exemple()))

    assert reponse.status_code == 201
    assert [r["slug"] for r in reponse.json()["revisions"]] == [
        "afficher-du-texte-en-python",
        "les-variables-en-python",
    ]
    async with SessionLocale() as db:
        revisions = list(await db.scalars(select(Revision)))
        journal = await db.scalar(select(ActionJournal).where(ActionJournal.action == "import"))
    assert {r.statut for r in revisions} == {StatutRevision.BROUILLON}
    assert all(r.assiste_par_ia and r.import_id for r in revisions)
    assert journal is not None
    # Rien n'est visible avant la relecture, pas même le parcours.
    assert (await client.get("/api/lecons")).json() == []
    assert (await client.get("/api/parcours")).json() == []


async def test_import_refuse_un_fichier_invalide(client: AsyncClient, csrf: dict[str, str]) -> None:
    paquet = exemple()
    lecon(paquet)["theme"] = "rust"

    reponse = await importer(client, csrf, en_json(paquet))

    assert reponse.status_code == 422
    async with SessionLocale() as db:
        assert list(await db.scalars(select(Revision))) == []


async def test_import_copie_les_images(client: AsyncClient, csrf: dict[str, str]) -> None:
    fichier = en_zip(avec_image(exemple()), {"images/schema.png": PNG})

    reponse = await importer(client, csrf, fichier)

    identifiant = reponse.json()["id"]
    image = get_config().dossier_medias / "imports" / identifiant / "images" / "schema.png"
    assert image.read_bytes() == PNG
    contenus = [r.contenu for r in await _toutes_les_revisions()]
    assert any(f"/medias/imports/{identifiant}/images/schema.png" in c for c in contenus)


async def _toutes_les_revisions() -> list[Revision]:
    async with SessionLocale() as db:
        return list(await db.scalars(select(Revision)))
