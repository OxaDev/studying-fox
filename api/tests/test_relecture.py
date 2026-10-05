import json
from pathlib import Path
from typing import cast

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update

from app.comptes.modeles import Role, Utilisateur
from app.db import SessionLocale
from app.emails import ExpediteurMemoire
from app.lecons.modeles import Revision, StatutRevision
from tests.outils import Compte, connecter, creer_compte, creer_lecon, creer_themes

EXEMPLE = Path(__file__).parents[2] / "docs" / "format-lecon" / "exemple.json"
FICHIER = ("exemple.json", EXEMPLE.read_bytes(), "application/json")


@pytest.fixture
async def relectrice(client: AsyncClient, boite_mail: ExpediteurMemoire) -> Compte:
    await creer_themes()
    return await creer_compte(client, boite_mail, pseudo="relectrice", role=Role.RELECTEUR)


async def _importer(client: AsyncClient, csrf: dict[str, str]) -> dict[str, str]:
    """Importe l'exemple et renvoie l'identifiant de révision de chaque leçon."""
    reponse = await client.post("/api/imports", files={"fichier": FICHIER}, headers=csrf)
    assert reponse.status_code == 201, reponse.text
    return {r["slug"]: r["revision_id"] for r in reponse.json()["revisions"]}


async def test_la_relecture_est_reservee_aux_relecteurs(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await connecter(client, await creer_compte(client, boite_mail, role=Role.CONTRIBUTEUR))

    assert (await client.get("/api/relecture")).status_code == 403


async def test_les_brouillons_importes_sont_dans_la_file(
    client: AsyncClient, relectrice: Compte
) -> None:
    csrf = await connecter(client, relectrice)
    await _importer(client, csrf)

    file = (await client.get("/api/relecture")).json()

    assert [(e["lecon_slug"], e["auteur"], e["fichier_importe"]) for e in file] == [
        ("afficher-du-texte-en-python", "relectrice", "exemple.json"),
        ("les-variables-en-python", "relectrice", "exemple.json"),
    ]


async def test_importer_relire_et_publier_l_exemple(
    client: AsyncClient, relectrice: Compte
) -> None:
    """Critère de fin du jalon 4 : exemple.json est importé, relu et publié."""
    csrf = await connecter(client, relectrice)
    revisions = await _importer(client, csrf)

    for revision_id in revisions.values():
        detail = (await client.get(f"/api/relecture/{revision_id}")).json()
        assert detail["peut_publier"] is True  # importée : la relectrice n'en est pas l'autrice
        reponse = await client.post(
            f"/api/relecture/{revision_id}/decision", json={"decision": "publier"}, headers=csrf
        )
        assert reponse.status_code == 200, reponse.text

    lecons = (await client.get("/api/lecons")).json()
    parcours = (await client.get("/api/parcours/premiers-pas-en-python")).json()
    lecon = (await client.get("/api/lecons/afficher-du-texte-en-python")).json()
    assert len(lecons) == 2
    assert [etape["slug"] for etape in parcours["lecons"]] == [
        "afficher-du-texte-en-python",
        "les-variables-en-python",
    ]
    assert lecon["assiste_par_ia"] is True
    assert (await client.get("/api/relecture")).json() == []


async def test_refuser_exige_un_commentaire(client: AsyncClient, relectrice: Compte) -> None:
    csrf = await connecter(client, relectrice)
    revision_id = (await _importer(client, csrf))["les-variables-en-python"]
    url = f"/api/relecture/{revision_id}/decision"

    sans = await client.post(url, json={"decision": "refuser"}, headers=csrf)
    avec = await client.post(
        url, json={"decision": "refuser", "commentaire": "Exemple trop long."}, headers=csrf
    )

    assert sans.status_code == 422
    assert avec.status_code == 200
    assert avec.json()["statut"] == "refusee"
    decision = avec.json()["historique"][0]["decisions"][0]
    assert (decision["decision"], decision["commentaire"]) == ("refuser", "Exemple trop long.")


async def test_une_version_deja_traitee_n_est_plus_a_relire(
    client: AsyncClient, relectrice: Compte
) -> None:
    csrf = await connecter(client, relectrice)
    revision_id = (await _importer(client, csrf))["les-variables-en-python"]
    url = f"/api/relecture/{revision_id}/decision"
    await client.post(url, json={"decision": "publier"}, headers=csrf)

    reponse = await client.post(url, json={"decision": "publier"}, headers=csrf)

    assert reponse.status_code == 409


async def test_on_ne_publie_pas_sa_propre_lecon(client: AsyncClient, relectrice: Compte) -> None:
    csrf = await connecter(client, relectrice)
    await creer_lecon("ma-lecon", auteur_email=relectrice.email, statut=StatutRevision.EN_RELECTURE)
    async with SessionLocale() as db:
        revision_id = await db.scalar(select(Revision.id))

    detail = (await client.get(f"/api/relecture/{revision_id}")).json()
    reponse = await client.post(
        f"/api/relecture/{revision_id}/decision", json={"decision": "publier"}, headers=csrf
    )

    assert detail["peut_publier"] is False
    assert reponse.status_code == 403


async def test_nouvelle_version_et_historique(client: AsyncClient, relectrice: Compte) -> None:
    csrf = await connecter(client, relectrice)
    premiere = (await _importer(client, csrf))["afficher-du-texte-en-python"]
    await client.post(
        f"/api/relecture/{premiere}/decision", json={"decision": "publier"}, headers=csrf
    )

    # Le même fichier, corrigé, est réimporté.
    paquet = json.loads(EXEMPLE.read_text(encoding="utf-8"))
    cast(list[dict[str, object]], paquet["lecons"])[0]["titre"] = "Afficher du texte (v2)"
    fichier = ("v2.json", json.dumps(paquet).encode(), "application/json")
    reponse = await client.post("/api/imports", files={"fichier": fichier}, headers=csrf)
    seconde = next(
        r["revision_id"]
        for r in reponse.json()["revisions"]
        if r["slug"] == "afficher-du-texte-en-python"
    )

    avant = (await client.get("/api/lecons/afficher-du-texte-en-python")).json()
    await client.post(
        f"/api/relecture/{seconde}/decision", json={"decision": "publier"}, headers=csrf
    )
    apres = (await client.get("/api/lecons/afficher-du-texte-en-python")).json()
    historique = (await client.get(f"/api/relecture/{seconde}")).json()["historique"]

    assert avant["titre"] == "Afficher du texte"  # la v1 reste en ligne pendant la relecture
    assert apres["titre"] == "Afficher du texte (v2)"
    assert [(v["numero"], v["en_ligne"]) for v in historique] == [(2, True), (1, False)]


async def test_auteur_supprime_reste_anonyme_dans_la_file(
    client: AsyncClient, relectrice: Compte, boite_mail: ExpediteurMemoire
) -> None:
    contributeur = await creer_compte(client, boite_mail, pseudo="ancien", role=Role.CONTRIBUTEUR)
    await creer_lecon(
        "orpheline", auteur_email=contributeur.email, statut=StatutRevision.EN_RELECTURE
    )
    async with SessionLocale() as db:
        await db.execute(update(Revision).values(auteur_id=None))
        await db.execute(
            update(Utilisateur).where(Utilisateur.email == contributeur.email).values(suspendu=True)
        )
        await db.commit()
    await connecter(client, relectrice)

    file = (await client.get("/api/relecture")).json()

    assert file[0]["auteur"] == "Contributeur anonyme"


async def test_publier_tout_un_import_en_une_fois(client: AsyncClient, relectrice: Compte) -> None:
    csrf = await connecter(client, relectrice)
    revisions = await _importer(client, csrf)
    file = (await client.get("/api/relecture")).json()

    reponse = await client.post(
        "/api/relecture/decisions",
        json={"decision": "publier", "revision_ids": list(revisions.values())},
        headers=csrf,
    )

    assert [e["peut_publier"] for e in file] == [True, True]
    assert reponse.status_code == 200, reponse.text
    assert sorted(reponse.json()["revision_ids"]) == sorted(revisions.values())
    parcours = (await client.get("/api/parcours/premiers-pas-en-python")).json()
    assert len(parcours["lecons"]) == 2
    assert (await client.get("/api/relecture")).json() == []
    # Chaque leçon garde sa propre décision dans l'historique.
    for revision_id in revisions.values():
        detail = (await client.get(f"/api/relecture/{revision_id}")).json()
        assert [d["decision"] for d in detail["historique"][0]["decisions"]] == ["publier"]


async def test_la_decision_groupee_est_tout_ou_rien(
    client: AsyncClient, relectrice: Compte
) -> None:
    csrf = await connecter(client, relectrice)
    revisions = await _importer(client, csrf)
    deja_publiee = revisions["afficher-du-texte-en-python"]
    await client.post(
        f"/api/relecture/{deja_publiee}/decision", json={"decision": "publier"}, headers=csrf
    )

    reponse = await client.post(
        "/api/relecture/decisions",
        json={"decision": "publier", "revision_ids": list(revisions.values())},
        headers=csrf,
    )

    assert reponse.status_code == 409
    assert "afficher-du-texte-en-python" in reponse.json()["detail"]
    restante = (await client.get(f"/api/relecture/{revisions['les-variables-en-python']}")).json()
    assert restante["statut"] == "brouillon"


async def test_la_decision_groupee_refuse_sa_propre_lecon(
    client: AsyncClient, relectrice: Compte
) -> None:
    csrf = await connecter(client, relectrice)
    importees = await _importer(client, csrf)
    await creer_lecon("ma-lecon", auteur_email=relectrice.email, statut=StatutRevision.EN_RELECTURE)
    async with SessionLocale() as db:
        mienne = await db.scalar(select(Revision.id).where(Revision.import_id.is_(None)))
    file = {e["lecon_slug"]: e for e in (await client.get("/api/relecture")).json()}

    reponse = await client.post(
        "/api/relecture/decisions",
        json={"decision": "publier", "revision_ids": [*importees.values(), str(mienne)]},
        headers=csrf,
    )

    assert file["ma-lecon"]["peut_publier"] is False
    assert reponse.status_code == 403
    assert len((await client.get("/api/relecture")).json()) == 3  # rien n'a été publié


async def test_la_decision_groupee_exige_un_commentaire_pour_refuser(
    client: AsyncClient, relectrice: Compte
) -> None:
    csrf = await connecter(client, relectrice)
    revisions = await _importer(client, csrf)

    reponse = await client.post(
        "/api/relecture/decisions",
        json={"decision": "refuser", "revision_ids": list(revisions.values())},
        headers=csrf,
    )

    assert reponse.status_code == 422


async def test_la_decision_groupee_signale_une_version_inconnue(
    client: AsyncClient, relectrice: Compte
) -> None:
    csrf = await connecter(client, relectrice)
    revisions = await _importer(client, csrf)

    reponse = await client.post(
        "/api/relecture/decisions",
        json={
            "decision": "publier",
            "revision_ids": [*revisions.values(), "00000000-0000-0000-0000-000000000000"],
        },
        headers=csrf,
    )

    assert reponse.status_code == 404
