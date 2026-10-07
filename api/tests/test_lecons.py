from pathlib import Path

from httpx import AsyncClient
from sqlalchemy import func, select

from app.db import SessionLocale
from app.emails import ExpediteurMemoire
from app.imports.format import Paquet
from app.lecons.commandes import charger_paquet
from app.lecons.modeles import Lecon, StatutRevision
from tests.outils import connecter, creer_compte, creer_lecon

EXEMPLE = Path(__file__).parents[2] / "docs" / "format-lecon" / "exemple.json"


async def test_les_lecons_exigent_une_connexion(client: AsyncClient) -> None:
    await creer_lecon("les-variables")

    assert (await client.get("/api/lecons")).status_code == 401
    assert (await client.get("/api/lecons/les-variables")).status_code == 401


async def test_liste_des_lecons_publiees(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await creer_lecon("les-variables", titre="Les variables")
    await creer_lecon("les-boucles", titre="Les boucles")
    await creer_lecon("brouillon", titre="Pas encore publiée", statut=StatutRevision.BROUILLON)
    await connecter(client, await creer_compte(client, boite_mail))

    reponse = await client.get("/api/lecons")

    assert reponse.status_code == 200
    assert [lecon["titre"] for lecon in reponse.json()] == ["Les boucles", "Les variables"]
    assert reponse.json()[0]["theme"] == {"slug": "python", "nom": "Python"}


async def test_les_lecons_suivent_l_ordre_des_themes(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await creer_lecon("les-variables", titre="Les variables")
    await creer_lecon("le-dom", titre="Le DOM", theme_slug="javascript")
    await creer_lecon("afficher", titre="Afficher du texte", theme_slug="python-bases")
    await connecter(client, await creer_compte(client, boite_mail))

    reponse = await client.get("/api/lecons")

    assert [lecon["slug"] for lecon in reponse.json()] == ["afficher", "le-dom", "les-variables"]


async def test_lire_une_lecon(client: AsyncClient, boite_mail: ExpediteurMemoire) -> None:
    compte = await creer_compte(client, boite_mail, pseudo="aiko")
    await creer_lecon("les-variables", auteur_email=compte.email, assiste_par_ia=True)
    await connecter(client, compte)

    reponse = await client.get("/api/lecons/les-variables")

    assert reponse.status_code == 200
    lecon = reponse.json()
    assert lecon["contenu"].startswith("Une **variable**")
    assert lecon["objectifs"] == ["Créer une variable"]
    assert lecon["assiste_par_ia"] is True
    assert lecon["auteurs"] == ["aiko"]


async def test_auteur_supprime_devient_anonyme(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await creer_lecon("les-variables")
    await connecter(client, await creer_compte(client, boite_mail))

    reponse = await client.get("/api/lecons/les-variables")

    assert reponse.json()["auteurs"] == ["Contributeur anonyme"]


async def test_lecon_inconnue_ou_non_publiee(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await creer_lecon("brouillon", statut=StatutRevision.BROUILLON)
    await connecter(client, await creer_compte(client, boite_mail))

    assert (await client.get("/api/lecons/brouillon")).status_code == 404
    assert (await client.get("/api/lecons/inconnue")).status_code == 404


async def test_charger_l_exemple_deux_fois_ne_cree_pas_de_doublon() -> None:
    paquet = Paquet.model_validate_json(EXEMPLE.read_text(encoding="utf-8"))

    async with SessionLocale() as db:
        premiere = await charger_paquet(db, paquet)
        seconde = await charger_paquet(db, paquet)
        nombre = await db.scalar(select(func.count()).select_from(Lecon))

    assert premiere == ["afficher-du-texte-en-python", "les-variables-en-python"]
    assert seconde == []
    assert nombre == 2
