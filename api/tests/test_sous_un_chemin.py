"""Site servi sous un chemin du domaine, derrière un proxy qui enlève ce préfixe (ADR 0031)."""

import pytest
from httpx import AsyncClient

from app.config import Config
from app.emails import ExpediteurMemoire
from tests.outils import creer_compte, creer_lecon, creer_parcours


def test_le_chemin_vient_de_l_adresse_publique() -> None:
    config = Config(url_publique="https://exemple.fr/studying-fox/")

    assert config.url_publique == "https://exemple.fr/studying-fox"
    assert config.chemin_base == "/studying-fox"
    assert config.chemin_cookie == "/studying-fox"


def test_a_la_racine_du_domaine() -> None:
    config = Config(url_publique="https://exemple.fr")

    assert config.chemin_base == ""
    assert config.chemin_cookie == "/"


@pytest.mark.usefixtures("sous_un_chemin")
async def test_les_liens_de_la_vitrine_gardent_le_chemin(client: AsyncClient) -> None:
    await creer_lecon("les-variables", titre="Les variables")
    await creer_parcours("debuter", ["les-variables"], titre="Débuter en Python")

    page = (await client.get("/")).text

    assert '<link rel="stylesheet" href="/studying-fox/statique/vitrine.css">' in page
    assert '<a href="/studying-fox/parcours/debuter">Débuter en Python</a>' in page
    assert '<a href="/studying-fox/app/inscription"' in page
    assert '<meta property="og:url" content="https://exemple.fr/studying-fox/">' in page
    # Le proxy a enlevé le préfixe : la page d'accueil reste la page courante.
    assert '<a href="/studying-fox/" aria-current="page">Accueil</a>' in page
    assert 'href="/parcours' not in page


@pytest.mark.usefixtures("sous_un_chemin")
async def test_robots_et_sitemap_gardent_le_chemin(client: AsyncClient) -> None:
    robots = (await client.get("/robots.txt")).text
    sitemap = (await client.get("/sitemap.xml")).text

    assert "Disallow: /studying-fox/app/" in robots
    assert "Disallow: /studying-fox/api/" in robots
    assert "Sitemap: https://exemple.fr/studying-fox/sitemap.xml" in robots
    assert "<loc>https://exemple.fr/studying-fox/parcours</loc>" in sitemap


@pytest.mark.usefixtures("sous_un_chemin")
async def test_le_cookie_de_session_reste_sous_le_chemin(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    compte = await creer_compte(client, boite_mail)

    reponse = await client.post(
        "/api/comptes/connexion",
        json={"email": compte.email, "mot_de_passe": compte.mot_de_passe},
    )

    assert "Path=/studying-fox;" in reponse.headers["set-cookie"]
