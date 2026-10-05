from httpx import AsyncClient

from app.emails import ExpediteurMemoire
from app.lecons.modeles import Niveau, StatutRevision
from app.recherche.schemas import ResultatLecon, ResultatParcours, Resultats, Segment
from app.recherche.service import decouper
from tests.outils import connecter, creer_compte, creer_lecon, creer_parcours

FONCTIONS = "Découper son code en blocs réutilisables."


async def _preparer(client: AsyncClient, boite: ExpediteurMemoire) -> dict[str, str]:
    await creer_lecon("les-variables", titre="Les variables")
    await creer_lecon(
        "les-fonctions",
        titre="Une fonction",
        resume=FONCTIONS,
        contenu="## Définir\n\nLe mot-clé `def` crée une **fonction**. Le réseau est lent.\n",
        niveau=Niveau.INTERMEDIAIRE,
    )
    await creer_lecon("brouillon", titre="Les fonctions avancées", statut=StatutRevision.BROUILLON)
    return await connecter(client, await creer_compte(client, boite))


async def _chercher(client: AsyncClient, **parametres: str) -> Resultats:
    reponse = await client.get("/api/recherche", params=parametres)
    assert reponse.status_code == 200, reponse.text
    return Resultats.model_validate(reponse.json())


def _slugs(resultats: list[ResultatLecon] | list[ResultatParcours]) -> list[str]:
    return [resultat.slug for resultat in resultats]


VIDE = Resultats(parcours=[], lecons=[])


async def test_la_recherche_exige_une_connexion(client: AsyncClient) -> None:
    assert (await client.get("/api/recherche", params={"q": "fonction"})).status_code == 401


async def test_fonctions_trouve_la_lecon_fonction(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    """Critère de fin du jalon 6. Le brouillon n'apparaît pas."""
    await _preparer(client, boite_mail)

    resultats = await _chercher(client, q="fonctions")

    assert _slugs(resultats.lecons) == ["les-fonctions"]
    assert resultats.lecons[0].theme.nom == "Python"


async def test_ignore_les_accents_et_les_majuscules(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await _preparer(client, boite_mail)

    assert _slugs((await _chercher(client, q="RESEAU")).lecons) == ["les-fonctions"]
    assert _slugs((await _chercher(client, q="DECOUPER")).lecons) == ["les-fonctions"]


async def test_tolere_une_faute_de_frappe_dans_le_titre(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await _preparer(client, boite_mail)

    assert _slugs((await _chercher(client, q="varaibles")).lecons) == ["les-variables"]


async def test_aucun_resultat(client: AsyncClient, boite_mail: ExpediteurMemoire) -> None:
    await _preparer(client, boite_mail)

    assert await _chercher(client, q="kubernetes") == VIDE
    # Que des mots vides : rien ne correspond, sans erreur.
    assert await _chercher(client, q="le de") == VIDE


async def test_le_titre_compte_plus_que_le_contenu(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await _preparer(client, boite_mail)
    await creer_lecon(
        "les-boucles",
        titre="Les boucles",
        contenu="Une boucle peut appeler une fonction à chaque tour.",
    )

    assert _slugs((await _chercher(client, q="fonction")).lecons) == [
        "les-fonctions",
        "les-boucles",
    ]


async def test_surligne_les_mots_trouves(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await _preparer(client, boite_mail)

    lecon = (await _chercher(client, q="réseau")).lecons[0]

    # Le résumé ne contient pas le mot : rien n'y est surligné.
    assert lecon.resume == [Segment(texte=FONCTIONS, surligne=False)]
    # L'extrait vient du contenu, sans la syntaxe Markdown.
    assert Segment(texte="réseau", surligne=True) in lecon.extrait
    texte = "".join(segment.texte for segment in lecon.extrait)
    assert "**" not in texte and "`" not in texte


async def test_filtres(client: AsyncClient, boite_mail: ExpediteurMemoire) -> None:
    await _preparer(client, boite_mail)
    await creer_parcours("debuter", ["les-variables"], titre="Débuter en Python")

    tout = await _chercher(client)
    assert _slugs(tout.lecons) == ["les-variables", "les-fonctions"]
    assert _slugs(tout.parcours) == ["debuter"]

    assert _slugs((await _chercher(client, niveau="intermediaire")).lecons) == ["les-fonctions"]
    assert await _chercher(client, theme="javascript") == VIDE
    seulement_parcours = await _chercher(client, type="parcours")
    assert seulement_parcours.lecons == []
    assert _slugs(seulement_parcours.parcours) == ["debuter"]
    assert (await _chercher(client, type="lecon")).parcours == []


async def test_trouve_un_parcours_avec_son_avancement(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    jeton = await _preparer(client, boite_mail)
    await creer_parcours(
        "debuter",
        ["les-variables", "les-fonctions"],
        titre="Débuter en Python",
        description="Des variables aux fonctions.",
    )
    await creer_parcours("vide", ["brouillon"], titre="Fonctions avancées")
    await client.put("/api/progression/lecons/les-variables", headers=jeton)

    parcours = (await _chercher(client, q="fonctions")).parcours

    # Le parcours sans leçon publiée n'apparaît pas.
    assert _slugs(parcours) == ["debuter"]
    assert parcours[0].nb_lecons == 2
    assert parcours[0].nb_terminees == 1
    assert Segment(texte="fonctions", surligne=True) in parcours[0].description


async def test_saisie_trop_longue(client: AsyncClient, boite_mail: ExpediteurMemoire) -> None:
    await _preparer(client, boite_mail)

    assert (await client.get("/api/recherche", params={"q": "a" * 201})).status_code == 422


def test_decouper() -> None:
    assert decouper("Une fonction et deux") == [
        Segment(texte="Une ", surligne=False),
        Segment(texte="fonction", surligne=True),
        Segment(texte=" et ", surligne=False),
        Segment(texte="deux", surligne=True),
    ]
    assert decouper("") == []
