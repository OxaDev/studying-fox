from pathlib import Path

from httpx import AsyncClient
from sqlalchemy import select

from app.db import SessionLocale
from app.emails import ExpediteurMemoire
from app.imports.format import Paquet
from app.lecons.commandes import charger_paquet
from app.lecons.modeles import StatutRevision
from app.parcours.modeles import Parcours
from tests.outils import connecter, creer_compte, creer_lecon, creer_parcours

EXEMPLE = Path(__file__).parents[2] / "docs" / "format-lecon" / "exemple.json"


async def _preparer(client: AsyncClient, boite: ExpediteurMemoire) -> dict[str, str]:
    """Un parcours de 3 leçons publiées (+ 1 brouillon) et un apprenant connecté."""
    for slug in ["variables", "conditions", "boucles"]:
        await creer_lecon(slug, titre=slug.capitalize())
    await creer_lecon("brouillon", statut=StatutRevision.BROUILLON)
    await creer_parcours("bases", ["variables", "brouillon", "conditions", "boucles"])
    return await connecter(client, await creer_compte(client, boite))


async def test_les_parcours_exigent_une_connexion(client: AsyncClient) -> None:
    assert (await client.get("/api/parcours")).status_code == 401


async def test_liste_des_parcours_publies(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await _preparer(client, boite_mail)
    await creer_parcours("cache", ["variables"], publie=False)

    reponse = await client.get("/api/parcours")

    assert [p["slug"] for p in reponse.json()] == ["bases"]
    parcours = reponse.json()[0]
    assert parcours["nb_lecons"] == 3  # le brouillon n'est pas compté
    assert parcours["nb_terminees"] == 0
    assert parcours["duree_minutes"] == 24


async def test_detail_d_un_parcours(client: AsyncClient, boite_mail: ExpediteurMemoire) -> None:
    csrf = await _preparer(client, boite_mail)
    await client.put("/api/progression/lecons/variables", headers=csrf)

    reponse = await client.get("/api/parcours/bases")

    parcours = reponse.json()
    assert [(e["slug"], e["terminee"]) for e in parcours["lecons"]] == [
        ("variables", True),
        ("conditions", False),
        ("boucles", False),
    ]
    assert parcours["prochaine_lecon"] == "conditions"
    assert parcours["nb_terminees"] == 1


async def test_parcours_inconnu_ou_non_publie(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await _preparer(client, boite_mail)
    await creer_parcours("cache", ["variables"], publie=False)

    assert (await client.get("/api/parcours/cache")).status_code == 404
    assert (await client.get("/api/parcours/inconnu")).status_code == 404


async def test_terminer_une_lecon_puis_la_reprendre(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    csrf = await _preparer(client, boite_mail)

    premiere = await client.put("/api/progression/lecons/variables", headers=csrf)
    seconde = await client.put("/api/progression/lecons/variables", headers=csrf)
    apres = await client.get("/api/lecons/variables")
    retrait = await client.delete("/api/progression/lecons/variables", headers=csrf)
    final = await client.get("/api/lecons/variables")

    assert (premiere.status_code, seconde.status_code) == (204, 204)
    assert apres.json()["terminee"] is True
    assert retrait.status_code == 204
    assert final.json()["terminee"] is False


async def test_terminer_exige_le_jeton_csrf(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await _preparer(client, boite_mail)

    reponse = await client.put(
        "/api/progression/lecons/variables", headers={"X-CSRF-Token": "faux"}
    )

    assert reponse.status_code == 403


async def test_terminer_une_lecon_non_publiee(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    csrf = await _preparer(client, boite_mail)

    assert (await client.put("/api/progression/lecons/brouillon", headers=csrf)).status_code == 404
    assert (await client.put("/api/progression/lecons/inconnue", headers=csrf)).status_code == 404


async def test_espace_vide(client: AsyncClient, boite_mail: ExpediteurMemoire) -> None:
    await _preparer(client, boite_mail)

    reponse = await client.get("/api/progression")

    assert reponse.json() == {
        "lecons_terminees": 0,
        "pourcentage": 0,
        "parcours_en_cours": [],
        "parcours_termines": [],
    }


async def test_espace_avec_parcours_en_cours_et_termine(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    csrf = await _preparer(client, boite_mail)
    await creer_lecon("fonctions")
    await creer_parcours("court", ["fonctions"])
    for slug in ["variables", "fonctions"]:
        await client.put(f"/api/progression/lecons/{slug}", headers=csrf)

    reponse = await client.get("/api/progression")

    espace = reponse.json()
    assert espace["lecons_terminees"] == 2
    assert espace["pourcentage"] == 50  # 2 leçons faites sur 4 dans les parcours commencés
    assert [p["slug"] for p in espace["parcours_en_cours"]] == ["bases"]
    assert [p["slug"] for p in espace["parcours_termines"]] == ["court"]


async def test_charger_l_exemple_cree_son_parcours() -> None:
    paquet = Paquet.model_validate_json(EXEMPLE.read_text(encoding="utf-8"))

    async with SessionLocale() as db:
        await charger_paquet(db, paquet)
        parcours = await db.scalar(select(Parcours))

    assert parcours is not None
    assert parcours.slug == "premiers-pas-en-python"
    assert parcours.publie is True
    assert [etape.lecon.slug for etape in parcours.etapes] == [
        "afficher-du-texte-en-python",
        "les-variables-en-python",
    ]
