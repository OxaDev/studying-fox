from pathlib import Path

from httpx import AsyncClient

from app.lecons.modeles import StatutRevision
from app.vitrine.routes import duree
from tests.outils import creer_lecon, creer_parcours

RACINE = Path(__file__).parents[2]


async def _preparer() -> None:
    await creer_lecon("les-variables", titre="Les variables")
    await creer_lecon("les-boucles", titre="Les boucles", contenu="Contenu réservé aux inscrits.")
    await creer_lecon("brouillon", titre="Pas encore publiée", statut=StatutRevision.BROUILLON)
    await creer_parcours(
        "debuter",
        ["les-variables", "brouillon", "les-boucles"],
        titre="Débuter en Python",
        description="Des variables aux boucles, <pas à pas>.",
    )
    await creer_parcours("cache", ["les-variables"], publie=False, titre="Parcours caché")


async def test_accueil_sans_connexion(client: AsyncClient) -> None:
    await _preparer()

    reponse = await client.get("/")

    assert reponse.status_code == 200
    assert reponse.headers["content-type"].startswith("text/html")
    assert "public" in reponse.headers["cache-control"]
    page = reponse.text
    assert '<html lang="fr">' in page
    assert page.count("<h1") == 1
    assert "<script" not in page
    assert '<a href="/parcours/debuter">Débuter en Python</a>' in page
    assert "Parcours caché" not in page
    assert '<meta property="og:url" content="http://localhost:5173/">' in page


async def test_accueil_sans_parcours(client: AsyncClient) -> None:
    reponse = await client.get("/")

    assert reponse.status_code == 200
    assert "Les premiers parcours arrivent bientôt" in reponse.text


async def test_catalogue_et_filtre_par_theme(client: AsyncClient) -> None:
    await _preparer()

    page = (await client.get("/parcours")).text
    assert "<title>Nos parcours — Le Renard Étudiant</title>" in page
    assert "Débuter en Python" in page
    assert "Parcours caché" not in page
    # Le texte est échappé : pas de HTML injecté depuis la base.
    assert "&lt;pas à pas&gt;" in page

    filtre = (await client.get("/parcours", params={"theme": "python"})).text
    assert "<title>Parcours Python — Le Renard Étudiant</title>" in filtre
    assert "Débuter en Python" in filtre
    assert "Débuter en Python" not in (await client.get("/parcours?theme=javascript")).text


async def test_presentation_d_un_parcours(client: AsyncClient) -> None:
    await _preparer()

    reponse = await client.get("/parcours/debuter")

    assert reponse.status_code == 200
    page = reponse.text
    assert "<title>Débuter en Python — Le Renard Étudiant</title>" in page
    # Les titres des leçons publiées, dans l'ordre, sans leur contenu (ADR 0016).
    assert page.index("Les variables") < page.index("Les boucles")
    assert "Pas encore publiée" not in page
    assert "Contenu réservé aux inscrits" not in page
    assert "2 leçons" in page
    assert '<a href="/app/inscription" class="bouton primaire">Commencer ce parcours</a>' in page
    assert "/app/connexion?retour=%2Fparcours%2Fdebuter" in page


async def test_parcours_introuvable(client: AsyncClient) -> None:
    await _preparer()

    for adresse in ["/parcours/cache", "/parcours/inconnu", "/nimporte-quoi"]:
        reponse = await client.get(adresse)
        assert reponse.status_code == 404, adresse
        assert reponse.headers["content-type"].startswith("text/html")
        assert "<h1>Page introuvable</h1>" in reponse.text


async def test_l_api_garde_ses_erreurs_en_json(client: AsyncClient) -> None:
    reponse = await client.get("/api/inconnue")

    assert reponse.status_code == 404
    assert reponse.json() == {"detail": "Not Found"}


async def test_sitemap(client: AsyncClient) -> None:
    await _preparer()

    reponse = await client.get("/sitemap.xml")

    assert reponse.status_code == 200
    assert reponse.headers["content-type"].startswith("application/xml")
    assert "<loc>http://localhost:5173/</loc>" in reponse.text
    assert "<loc>http://localhost:5173/parcours</loc>" in reponse.text
    assert "<loc>http://localhost:5173/parcours/debuter</loc>" in reponse.text
    assert "cache" not in reponse.text
    assert "<lastmod>" in reponse.text


async def test_robots(client: AsyncClient) -> None:
    reponse = await client.get("/robots.txt")

    assert reponse.status_code == 200
    assert "Disallow: /app/" in reponse.text
    assert "Sitemap: http://localhost:5173/sitemap.xml" in reponse.text


async def test_feuille_de_style(client: AsyncClient) -> None:
    reponse = await client.get("/statique/vitrine.css")

    assert reponse.status_code == 200
    assert (await client.get("/statique/polices/nunito-latin-800-normal.woff2")).status_code == 200


def test_les_couleurs_sont_celles_du_front() -> None:
    """La charte est partagée avec l'application (ADR 0016) : les deux copies restent identiques."""
    front = RACINE / "front" / "src" / "styles" / "tokens.css"
    vitrine = RACINE / "api" / "app" / "vitrine" / "statique" / "tokens.css"
    assert vitrine.read_text() == front.read_text(), (
        "Copier front/src/styles/tokens.css dans api/app/vitrine/statique/"
    )


def test_duree() -> None:
    assert duree(45) == "45 min"
    assert duree(60) == "1 h"
    assert duree(80) == "1 h 20"
