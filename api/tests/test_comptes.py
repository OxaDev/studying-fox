from datetime import timedelta

from httpx import AsyncClient
from sqlalchemy import update

from app.comptes.modeles import JetonEmail
from app.db import SessionLocale
from app.emails import ExpediteurMemoire
from app.temps import maintenant
from tests.outils import (
    MOT_DE_PASSE,
    Compte,
    connecter,
    creer_compte,
    jeton_du_dernier_email,
    nouveau_client,
)

INSCRIPTION = {"email": "Aiko@Exemple.fr", "pseudo": "aiko", "mot_de_passe": MOT_DE_PASSE}


# --- Inscription et confirmation ---------------------------------------------------------


async def test_inscription_envoie_un_email_de_confirmation(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    reponse = await client.post("/api/comptes/inscription", json=INSCRIPTION)

    assert reponse.status_code == 204
    assert len(boite_mail.envoyes) == 1
    email = boite_mail.envoyes[0]
    assert email.destinataire == "aiko@exemple.fr"
    assert "/app/confirmation?jeton=" in email.corps


async def test_connexion_refusee_tant_que_l_email_n_est_pas_confirme(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await client.post("/api/comptes/inscription", json=INSCRIPTION)
    identifiants = {"email": "aiko@exemple.fr", "mot_de_passe": MOT_DE_PASSE}

    avant = await client.post("/api/comptes/connexion", json=identifiants)
    jeton = jeton_du_dernier_email(boite_mail)
    confirmation = await client.post("/api/comptes/confirmation", json={"jeton": jeton})
    apres = await client.post("/api/comptes/connexion", json=identifiants)

    assert avant.status_code == 403
    assert confirmation.status_code == 204
    assert apres.status_code == 200
    assert apres.json()["pseudo"] == "aiko"
    assert apres.json()["role"] == "apprenant"


async def test_un_lien_de_confirmation_ne_sert_qu_une_fois(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await client.post("/api/comptes/inscription", json=INSCRIPTION)
    jeton = jeton_du_dernier_email(boite_mail)

    await client.post("/api/comptes/confirmation", json={"jeton": jeton})
    deuxieme = await client.post("/api/comptes/confirmation", json={"jeton": jeton})

    assert deuxieme.status_code == 400


async def test_un_lien_expire_est_refuse(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await client.post("/api/comptes/inscription", json=INSCRIPTION)
    async with SessionLocale() as db:
        await db.execute(update(JetonEmail).values(expire_le=maintenant() - timedelta(minutes=1)))
        await db.commit()

    reponse = await client.post(
        "/api/comptes/confirmation", json={"jeton": jeton_du_dernier_email(boite_mail)}
    )

    assert reponse.status_code == 400


async def test_inscription_avec_un_email_existant_ne_le_revele_pas(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await creer_compte(client, boite_mail)

    reponse = await client.post(
        "/api/comptes/inscription",
        json={"email": "aiko@exemple.fr", "pseudo": "autre", "mot_de_passe": MOT_DE_PASSE},
    )

    assert reponse.status_code == 204
    assert boite_mail.envoyes[-1].sujet == "Tu as déjà un compte"


async def test_pseudo_deja_pris_quelle_que_soit_la_casse(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await creer_compte(client, boite_mail, pseudo="aiko")

    reponse = await client.post(
        "/api/comptes/inscription",
        json={"email": "autre@exemple.fr", "pseudo": "AIKO", "mot_de_passe": MOT_DE_PASSE},
    )

    assert reponse.status_code == 409


async def test_mot_de_passe_trop_court_refuse(client: AsyncClient) -> None:
    reponse = await client.post(
        "/api/comptes/inscription", json={**INSCRIPTION, "mot_de_passe": "court"}
    )

    assert reponse.status_code == 422


async def test_renvoyer_la_confirmation(client: AsyncClient, boite_mail: ExpediteurMemoire) -> None:
    await client.post("/api/comptes/inscription", json=INSCRIPTION)
    premier_jeton = jeton_du_dernier_email(boite_mail)

    await client.post("/api/comptes/renvoyer-confirmation", json={"email": "aiko@exemple.fr"})
    ancien = await client.post("/api/comptes/confirmation", json={"jeton": premier_jeton})
    nouveau = await client.post(
        "/api/comptes/confirmation", json={"jeton": jeton_du_dernier_email(boite_mail)}
    )

    assert ancien.status_code == 400
    assert nouveau.status_code == 204


async def test_trop_d_emails_vers_la_meme_adresse(client: AsyncClient) -> None:
    for _ in range(3):
        await client.post("/api/comptes/mot-de-passe-oublie", json={"email": "x@exemple.fr"})

    reponse = await client.post("/api/comptes/mot-de-passe-oublie", json={"email": "x@exemple.fr"})

    assert reponse.status_code == 429


# --- Connexion, session et CSRF ----------------------------------------------------------


async def test_mauvais_mot_de_passe(client: AsyncClient, boite_mail: ExpediteurMemoire) -> None:
    compte = await creer_compte(client, boite_mail)

    reponse = await client.post(
        "/api/comptes/connexion", json={"email": compte.email, "mot_de_passe": "pas-le-bon"}
    )

    assert reponse.status_code == 401
    assert reponse.json()["detail"] == "Email ou mot de passe incorrect."


async def test_email_inconnu_meme_message_que_mauvais_mot_de_passe(client: AsyncClient) -> None:
    reponse = await client.post(
        "/api/comptes/connexion", json={"email": "personne@exemple.fr", "mot_de_passe": "x"}
    )

    assert reponse.status_code == 401
    assert reponse.json()["detail"] == "Email ou mot de passe incorrect."


async def test_connexion_bloquee_apres_cinq_echecs(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    compte = await creer_compte(client, boite_mail)
    for _ in range(5):
        await client.post(
            "/api/comptes/connexion", json={"email": compte.email, "mot_de_passe": "faux"}
        )

    reponse = await client.post(
        "/api/comptes/connexion",
        json={"email": compte.email, "mot_de_passe": compte.mot_de_passe},
    )

    assert reponse.status_code == 429


async def test_la_connexion_pose_un_cookie_httponly(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    compte = await creer_compte(client, boite_mail)

    reponse = await client.post(
        "/api/comptes/connexion",
        json={"email": compte.email, "mot_de_passe": compte.mot_de_passe},
    )

    cookie = reponse.headers["set-cookie"]
    assert cookie.startswith("renard_session=")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie


async def test_moi_sans_session(client: AsyncClient) -> None:
    reponse = await client.get("/api/comptes/moi")

    assert reponse.status_code == 401


async def test_moi_renvoie_l_utilisateur_connecte(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    compte = await creer_compte(client, boite_mail)
    csrf = await connecter(client, compte)

    reponse = await client.get("/api/comptes/moi")

    assert reponse.status_code == 200
    assert reponse.json()["email"] == compte.email
    assert reponse.json()["jeton_csrf"] == csrf["X-CSRF-Token"]


async def test_ecriture_refusee_sans_jeton_csrf(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    compte = await creer_compte(client, boite_mail)
    await connecter(client, compte)

    reponse = await client.patch("/api/comptes/moi", json={"pseudo": "nouveau"})

    assert reponse.status_code == 403


async def test_formulaire_venu_d_un_autre_site_refuse(client: AsyncClient) -> None:
    # Un formulaire HTML ne peut envoyer ni JSON, ni en-tête personnalisé.
    reponse = await client.post(
        "/api/comptes/connexion", data={"email": "a@exemple.fr", "mot_de_passe": "x"}
    )

    assert reponse.status_code == 415


async def test_deconnexion(client: AsyncClient, boite_mail: ExpediteurMemoire) -> None:
    compte = await creer_compte(client, boite_mail)
    csrf = await connecter(client, compte)

    reponse = await client.post("/api/comptes/deconnexion", headers=csrf)
    apres = await client.get("/api/comptes/moi")

    assert reponse.status_code == 204
    assert apres.status_code == 401


# --- Profil ------------------------------------------------------------------------------


async def test_modifier_son_pseudo(client: AsyncClient, boite_mail: ExpediteurMemoire) -> None:
    compte = await creer_compte(client, boite_mail)
    csrf = await connecter(client, compte)

    reponse = await client.patch("/api/comptes/moi", json={"pseudo": "kitsune"}, headers=csrf)

    assert reponse.status_code == 200
    assert reponse.json()["pseudo"] == "kitsune"


async def test_changer_de_mot_de_passe_deconnecte_les_autres_appareils(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    compte = await creer_compte(client, boite_mail)
    csrf = await connecter(client, compte)
    async with nouveau_client() as autre:
        await connecter(autre, compte)

        reponse = await client.post(
            "/api/comptes/moi/mot-de-passe",
            json={"actuel": compte.mot_de_passe, "nouveau": "encore-plus-solide-!"},
            headers=csrf,
        )
        ici = await client.get("/api/comptes/moi")
        ailleurs = await autre.get("/api/comptes/moi")

    assert reponse.status_code == 204
    assert ici.status_code == 200
    assert ailleurs.status_code == 401


async def test_changer_de_mot_de_passe_exige_l_actuel(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    compte = await creer_compte(client, boite_mail)
    csrf = await connecter(client, compte)

    reponse = await client.post(
        "/api/comptes/moi/mot-de-passe",
        json={"actuel": "pas-le-bon", "nouveau": "encore-plus-solide-!"},
        headers=csrf,
    )

    assert reponse.status_code == 400


async def test_changer_d_email(client: AsyncClient, boite_mail: ExpediteurMemoire) -> None:
    compte = await creer_compte(client, boite_mail)
    csrf = await connecter(client, compte)

    demande = await client.post(
        "/api/comptes/moi/email",
        json={"nouvel_email": "nouvelle@exemple.fr", "mot_de_passe": compte.mot_de_passe},
        headers=csrf,
    )
    assert boite_mail.envoyes[-1].destinataire == "nouvelle@exemple.fr"
    confirmation = await client.post(
        "/api/comptes/confirmation", json={"jeton": jeton_du_dernier_email(boite_mail)}
    )
    moi = await client.get("/api/comptes/moi")

    assert demande.status_code == 204
    assert confirmation.status_code == 204
    assert moi.json()["email"] == "nouvelle@exemple.fr"


# --- Mot de passe oublié -----------------------------------------------------------------


async def test_reinitialiser_son_mot_de_passe(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    compte = await creer_compte(client, boite_mail)
    await client.post("/api/comptes/mot-de-passe-oublie", json={"email": compte.email})
    jeton = jeton_du_dernier_email(boite_mail)

    reponse = await client.post(
        "/api/comptes/reinitialisation", json={"jeton": jeton, "nouveau": "tout-nouveau-mdp"}
    )
    reutilisation = await client.post(
        "/api/comptes/reinitialisation", json={"jeton": jeton, "nouveau": "encore-un-autre"}
    )

    assert reponse.status_code == 204
    assert reutilisation.status_code == 400
    await connecter(client, Compte(compte.email, compte.pseudo, "tout-nouveau-mdp"))


async def test_mot_de_passe_oublie_email_inconnu(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    reponse = await client.post(
        "/api/comptes/mot-de-passe-oublie", json={"email": "personne@exemple.fr"}
    )

    assert reponse.status_code == 204
    assert boite_mail.envoyes == []
