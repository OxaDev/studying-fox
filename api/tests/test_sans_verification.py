"""Comptes sans vérification de l'email, en attendant un service d'envoi (ADR 0023)."""

from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update

from app.comptes.modeles import Utilisateur
from app.db import SessionLocale
from app.emails import ExpediteurMemoire
from app.rgpd.purge import purger
from app.temps import maintenant
from tests.outils import MOT_DE_PASSE

pytestmark = pytest.mark.usefixtures("sans_verification")

INSCRIPTION = {"email": "aiko@exemple.fr", "pseudo": "aiko", "mot_de_passe": MOT_DE_PASSE}


async def test_les_reglages_sont_publics(client: AsyncClient) -> None:
    reponse = await client.get("/api/comptes/reglages")

    assert reponse.status_code == 200
    assert reponse.json() == {"verification_email": False}


async def test_on_se_connecte_juste_apres_l_inscription(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    inscription = await client.post("/api/comptes/inscription", json=INSCRIPTION)
    connexion = await client.post(
        "/api/comptes/connexion",
        json={"email": "aiko@exemple.fr", "mot_de_passe": MOT_DE_PASSE},
    )

    assert inscription.status_code == 204
    assert connexion.status_code == 200
    assert connexion.json()["pseudo"] == "aiko"
    assert boite_mail.envoyes == []


async def test_l_email_reste_obligatoire_et_valide(client: AsyncClient) -> None:
    sans_email = {"pseudo": "aiko", "mot_de_passe": MOT_DE_PASSE}
    invalide = {**INSCRIPTION, "email": "pas-un-email"}

    assert (await client.post("/api/comptes/inscription", json=sans_email)).status_code == 422
    assert (await client.post("/api/comptes/inscription", json=invalide)).status_code == 422


async def test_une_adresse_deja_inscrite_est_signalee(client: AsyncClient) -> None:
    await client.post("/api/comptes/inscription", json=INSCRIPTION)

    reponse = await client.post(
        "/api/comptes/inscription", json={**INSCRIPTION, "pseudo": "kitsune"}
    )

    assert reponse.status_code == 409
    assert reponse.json()["detail"] == "Cette adresse email est déjà utilisée."


async def test_changer_d_adresse_est_immediat(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await client.post("/api/comptes/inscription", json=INSCRIPTION)
    connexion = await client.post(
        "/api/comptes/connexion",
        json={"email": "aiko@exemple.fr", "mot_de_passe": MOT_DE_PASSE},
    )
    csrf = {"X-CSRF-Token": connexion.json()["jeton_csrf"]}

    reponse = await client.post(
        "/api/comptes/moi/email",
        json={"nouvel_email": "aiko@ailleurs.fr", "mot_de_passe": MOT_DE_PASSE},
        headers=csrf,
    )

    assert reponse.status_code == 204
    assert (await client.get("/api/comptes/moi")).json()["email"] == "aiko@ailleurs.fr"
    assert boite_mail.envoyes == []


async def test_la_purge_garde_les_comptes_non_verifies(client: AsyncClient) -> None:
    await client.post("/api/comptes/inscription", json=INSCRIPTION)
    async with SessionLocale() as db:
        await db.execute(update(Utilisateur).values(cree_le=maintenant() - timedelta(days=60)))
        await db.commit()

        bilan = await purger(db, maintenant())

        restants = list(await db.scalars(select(Utilisateur.pseudo)))
    assert bilan.comptes == 0
    assert restants == ["aiko"]
