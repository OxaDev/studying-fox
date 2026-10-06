import pytest
from httpx import AsyncClient

from app.comptes.modeles import Role
from app.emails import ExpediteurMemoire
from app.lecons.modeles import StatutRevision
from tests.outils import connecter, creer_compte, creer_lecon, creer_themes, nouveau_client

CONTENU = {
    "titre": "Les boucles for",
    "resume": "Répéter une action plusieurs fois avec une boucle for.",
    "objectifs": ["Écrire une boucle for", "  "],
    "duree_minutes": 10,
    "contenu": (
        "Une **boucle** répète du code.\n\n```python run\nfor i in range(3):\n    print(i)\n```\n"
    ),
}


@pytest.fixture
async def csrf(client: AsyncClient, boite_mail: ExpediteurMemoire) -> dict[str, str]:
    """Une contributrice connectée."""
    await creer_themes()
    compte = await creer_compte(client, boite_mail, pseudo="aiko", role=Role.CONTRIBUTEUR)
    return await connecter(client, compte)


async def _nouvelle(client: AsyncClient, csrf: dict[str, str], slug: str = "les-boucles") -> str:
    reponse = await client.post(
        "/api/contributions",
        json={"slug": slug, "titre": "Les boucles", "theme": "python", "niveau": "debutant"},
        headers=csrf,
    )
    assert reponse.status_code == 201, reponse.text
    return str(reponse.json()["revision_id"])


async def test_un_apprenant_ne_contribue_pas(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await connecter(client, await creer_compte(client, boite_mail))

    assert (await client.get("/api/contributions")).status_code == 403


async def test_creer_puis_enregistrer_un_brouillon(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    revision_id = await _nouvelle(client, csrf)

    reponse = await client.put(f"/api/contributions/{revision_id}", json=CONTENU, headers=csrf)

    brouillon = reponse.json()
    assert brouillon["statut"] == "brouillon"
    assert brouillon["objectifs"] == ["Écrire une boucle for"]  # les lignes vides sont retirées
    assert brouillon["nouvelle_lecon"] is True
    liste = (await client.get("/api/contributions")).json()
    assert [(c["titre"], c["statut"]) for c in liste] == [("Les boucles for", "brouillon")]
    # Un brouillon n'est visible ni des apprenants ni des relecteurs.
    assert (await client.get("/api/lecons")).json() == []


async def test_identifiant_deja_pris(client: AsyncClient, csrf: dict[str, str]) -> None:
    await _nouvelle(client, csrf)

    reponse = await client.post(
        "/api/contributions",
        json={"slug": "les-boucles", "titre": "Autre", "theme": "python", "niveau": "debutant"},
        headers=csrf,
    )

    assert reponse.status_code == 409


async def test_soumettre_exige_la_licence_puis_un_contenu_complet(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    revision_id = await _nouvelle(client, csrf)
    url = f"/api/contributions/{revision_id}/soumettre"

    sans_licence = await client.post(url, json={}, headers=csrf)
    incomplet = await client.post(url, json={"accepte_licence": True}, headers=csrf)
    moi = (await client.get("/api/comptes/moi")).json()

    assert sans_licence.status_code == 422
    assert incomplet.status_code == 422
    champs = {e["loc"][-1] for e in incomplet.json()["detail"]}
    assert champs == {"resume", "objectifs", "contenu"}
    # La requête a échoué : rien n'est enregistré, pas même l'acceptation de la licence.
    assert moi["licence_acceptee"] is False


async def test_proposer_une_lecon_jusqu_a_sa_publication(
    client: AsyncClient, csrf: dict[str, str], boite_mail: ExpediteurMemoire
) -> None:
    """Critère de fin du jalon 5 : un contributeur propose une leçon depuis le site."""
    revision_id = await _nouvelle(client, csrf)
    await client.put(f"/api/contributions/{revision_id}", json=CONTENU, headers=csrf)

    soumission = await client.post(
        f"/api/contributions/{revision_id}/soumettre", json={"accepte_licence": True}, headers=csrf
    )
    modification = await client.put(f"/api/contributions/{revision_id}", json=CONTENU, headers=csrf)
    assert soumission.json()["statut"] == "en_relecture"
    assert modification.status_code == 409  # figée dès la soumission (ADR 0022)
    assert (await client.get("/api/comptes/moi")).json()["licence_acceptee"] is True

    async with nouveau_client() as relectrice:
        compte = await creer_compte(
            relectrice, boite_mail, pseudo="relectrice", role=Role.RELECTEUR
        )
        csrf_relectrice = await connecter(relectrice, compte)
        file = (await relectrice.get("/api/relecture")).json()
        assert [e["auteur"] for e in file] == ["aiko"]
        await relectrice.post(
            f"/api/relecture/{revision_id}/decision",
            json={"decision": "publier"},
            headers=csrf_relectrice,
        )

    lecon = (await client.get("/api/lecons/les-boucles")).json()
    assert lecon["titre"] == "Les boucles for"
    assert lecon["auteurs"] == ["aiko"]


async def test_corriger_apres_une_demande_de_corrections(
    client: AsyncClient, csrf: dict[str, str], boite_mail: ExpediteurMemoire
) -> None:
    revision_id = await _nouvelle(client, csrf)
    await client.put(f"/api/contributions/{revision_id}", json=CONTENU, headers=csrf)
    await client.post(
        f"/api/contributions/{revision_id}/soumettre", json={"accepte_licence": True}, headers=csrf
    )
    async with nouveau_client() as relectrice:
        compte = await creer_compte(
            relectrice, boite_mail, pseudo="relectrice", role=Role.RELECTEUR
        )
        await relectrice.post(
            f"/api/relecture/{revision_id}/decision",
            json={"decision": "corriger", "commentaire": "Ajoute un exemple avec while."},
            headers=await connecter(relectrice, compte),
        )

    relue = (await client.get(f"/api/contributions/{revision_id}")).json()
    reprise = await client.post(f"/api/contributions/{revision_id}/reprendre", headers=csrf)
    encore = await client.post(f"/api/contributions/{revision_id}/reprendre", headers=csrf)

    assert relue["statut"] == "a_corriger"
    assert relue["retours"][0]["commentaire"] == "Ajoute un exemple avec while."
    assert reprise.json()["numero"] == 2
    assert reprise.json()["contenu"] == CONTENU["contenu"]
    assert encore.json()["revision_id"] == reprise.json()["revision_id"]  # pas de doublon
    # La version relue reste dans l'historique, avec son statut.
    assert (await client.get(f"/api/contributions/{revision_id}")).json()["statut"] == "a_corriger"


async def test_proposer_une_modification_d_une_lecon_publiee(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    await creer_lecon("les-variables", titre="Les variables")

    premiere = await client.post("/api/contributions/depuis/les-variables", headers=csrf)
    seconde = await client.post("/api/contributions/depuis/les-variables", headers=csrf)

    proposition = premiere.json()
    assert proposition["numero"] == 2
    assert proposition["titre"] == "Les variables"
    assert proposition["nouvelle_lecon"] is False
    assert seconde.json()["revision_id"] == proposition["revision_id"]
    # La version en ligne ne change pas.
    assert (await client.get("/api/lecons/les-variables")).json()["titre"] == "Les variables"


async def test_on_ne_voit_pas_les_brouillons_des_autres(
    client: AsyncClient, csrf: dict[str, str], boite_mail: ExpediteurMemoire
) -> None:
    revision_id = await _nouvelle(client, csrf)
    async with nouveau_client() as autre:
        compte = await creer_compte(autre, boite_mail, pseudo="autre", role=Role.CONTRIBUTEUR)
        csrf_autre = await connecter(autre, compte)

        lecture = await autre.get(f"/api/contributions/{revision_id}")
        ecriture = await autre.put(
            f"/api/contributions/{revision_id}", json=CONTENU, headers=csrf_autre
        )

    assert lecture.status_code == 404
    assert ecriture.status_code == 404


async def test_supprimer_un_brouillon_de_nouvelle_lecon(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    revision_id = await _nouvelle(client, csrf)

    reponse = await client.delete(f"/api/contributions/{revision_id}", headers=csrf)

    assert reponse.status_code == 204
    assert (await client.get("/api/contributions")).json() == []
    # L'identifiant est de nouveau libre.
    await _nouvelle(client, csrf)


async def test_changer_le_theme_d_une_nouvelle_lecon(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    revision_id = await _nouvelle(client, csrf)

    reponse = await client.put(
        f"/api/contributions/{revision_id}",
        json={**CONTENU, "theme": "javascript", "niveau": "intermediaire"},
        headers=csrf,
    )

    assert reponse.json()["theme"]["slug"] == "javascript"
    assert reponse.json()["niveau"] == "intermediaire"


async def test_liste_des_themes(client: AsyncClient, csrf: dict[str, str]) -> None:
    reponse = await client.get("/api/lecons/themes")

    assert [t["slug"] for t in reponse.json()] == ["javascript", "python", "python-bases"]


def test_statuts_ouverts() -> None:
    from app.contribution.routes import OUVERTES

    assert StatutRevision.PUBLIEE not in OUVERTES
