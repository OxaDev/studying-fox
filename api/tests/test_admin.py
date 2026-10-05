from httpx import AsyncClient
from sqlalchemy import select

from app.admin.modeles import ActionJournal
from app.comptes.modeles import Role
from app.db import SessionLocale
from app.emails import ExpediteurMemoire
from tests.outils import connecter, creer_compte, creer_lecon, nouveau_client


async def _id_de(client: AsyncClient, email: str) -> str:
    reponse = await client.get("/api/admin/utilisateurs")
    return next(str(u["id"]) for u in reponse.json()["utilisateurs"] if u["email"] == email)


async def test_un_apprenant_n_accede_pas_a_l_admin(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    compte = await creer_compte(client, boite_mail)
    await connecter(client, compte)

    reponse = await client.get("/api/admin/utilisateurs")

    assert reponse.status_code == 403


async def test_un_relecteur_n_accede_pas_a_l_admin(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    compte = await creer_compte(client, boite_mail, role=Role.RELECTEUR)
    await connecter(client, compte)

    reponse = await client.get("/api/admin/utilisateurs")

    assert reponse.status_code == 403


async def test_un_admin_change_un_role_et_c_est_journalise(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    apprenant = await creer_compte(client, boite_mail, pseudo="aiko")
    admin = await creer_compte(client, boite_mail, pseudo="chef", role=Role.ADMIN)
    csrf = await connecter(client, admin)

    reponse = await client.patch(
        f"/api/admin/utilisateurs/{await _id_de(client, apprenant.email)}",
        json={"role": "relecteur"},
        headers=csrf,
    )

    assert reponse.status_code == 200
    assert reponse.json()["role"] == "relecteur"
    async with SessionLocale() as db:
        action = await db.scalar(select(ActionJournal))
    assert action is not None
    assert action.action == "changement_role"
    assert action.details == {"avant": "apprenant", "apres": "relecteur"}


async def test_un_admin_ne_modifie_pas_son_propre_compte(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    admin = await creer_compte(client, boite_mail, pseudo="chef", role=Role.ADMIN)
    csrf = await connecter(client, admin)

    reponse = await client.patch(
        f"/api/admin/utilisateurs/{await _id_de(client, admin.email)}",
        json={"role": "apprenant"},
        headers=csrf,
    )

    assert reponse.status_code == 400


async def test_suspendre_un_compte_le_deconnecte(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    apprenant = await creer_compte(client, boite_mail, pseudo="aiko")
    admin = await creer_compte(client, boite_mail, pseudo="chef", role=Role.ADMIN)
    async with nouveau_client() as autre:
        await connecter(autre, apprenant)
        csrf = await connecter(client, admin)

        reponse = await client.patch(
            f"/api/admin/utilisateurs/{await _id_de(client, apprenant.email)}",
            json={"suspendu": True},
            headers=csrf,
        )
        moi = await autre.get("/api/comptes/moi")
        reconnexion = await autre.post(
            "/api/comptes/connexion",
            json={"email": apprenant.email, "mot_de_passe": apprenant.mot_de_passe},
        )

    assert reponse.status_code == 200
    assert moi.status_code == 401
    assert reconnexion.status_code == 403


async def test_chercher_un_utilisateur(client: AsyncClient, boite_mail: ExpediteurMemoire) -> None:
    await creer_compte(client, boite_mail, pseudo="aiko")
    await creer_compte(client, boite_mail, pseudo="kitsune")
    await creer_compte(client, boite_mail, pseudo="a_b")
    await connecter(client, await creer_compte(client, boite_mail, pseudo="chef", role=Role.ADMIN))

    tous = (await client.get("/api/admin/utilisateurs", params={"limite": 2})).json()
    assert tous["total"] == 4
    assert len(tous["utilisateurs"]) == 2

    async def pseudos(q: str) -> list[str]:
        page = (await client.get("/api/admin/utilisateurs", params={"q": q})).json()
        return sorted(u["pseudo"] for u in page["utilisateurs"])

    assert await pseudos("KIT") == ["kitsune"]
    assert await pseudos("aiko@") == ["aiko"]
    # « _ » n'est pas un joker : seul « a_b » commence par « a_ ».
    assert await pseudos("a_") == ["a_b"]


async def test_gerer_les_themes(client: AsyncClient, boite_mail: ExpediteurMemoire) -> None:
    await creer_lecon("les-variables")
    csrf = await connecter(
        client, await creer_compte(client, boite_mail, pseudo="chef", role=Role.ADMIN)
    )

    creation = await client.post(
        "/api/admin/themes", json={"slug": "sql", "nom": "SQL"}, headers=csrf
    )
    assert creation.status_code == 201
    doublon = await client.post(
        "/api/admin/themes", json={"slug": "sql", "nom": "Autre"}, headers=csrf
    )
    assert doublon.status_code == 409
    invalide = await client.post(
        "/api/admin/themes", json={"slug": "Avec Espace", "nom": "X"}, headers=csrf
    )
    assert invalide.status_code == 422

    renomme = await client.patch(
        "/api/admin/themes/sql", json={"nom": "Bases de données"}, headers=csrf
    )
    assert renomme.json()["nom"] == "Bases de données"

    themes = (await client.get("/api/admin/themes")).json()
    assert themes == [
        {"slug": "sql", "nom": "Bases de données", "nb_lecons": 0, "nb_parcours": 0},
        {"slug": "python", "nom": "Python", "nb_lecons": 1, "nb_parcours": 0},
    ]

    utilise = await client.delete("/api/admin/themes/python", headers=csrf)
    assert utilise.status_code == 409
    assert (await client.delete("/api/admin/themes/sql", headers=csrf)).status_code == 204
    assert (await client.delete("/api/admin/themes/sql", headers=csrf)).status_code == 404

    journal = (await client.get("/api/admin/journal")).json()
    assert [a["action"] for a in journal["actions"]] == [
        "theme_suppression",
        "theme_modification",
        "theme_creation",
    ]
    assert journal["actions"][0]["acteur"] == "chef"
    assert journal["actions"][0]["cible"] == "Thème sql"


async def test_les_themes_sont_reserves_aux_admins(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    csrf = await connecter(client, await creer_compte(client, boite_mail, role=Role.RELECTEUR))

    assert (await client.get("/api/admin/themes")).status_code == 403
    assert (
        await client.post("/api/admin/themes", json={"slug": "sql", "nom": "SQL"}, headers=csrf)
    ).status_code == 403
    assert (await client.get("/api/admin/journal")).status_code == 403


async def test_journal_lisible_et_filtrable(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    apprenant = await creer_compte(client, boite_mail, pseudo="aiko")
    csrf = await connecter(
        client, await creer_compte(client, boite_mail, pseudo="chef", role=Role.ADMIN)
    )
    identifiant = await _id_de(client, apprenant.email)
    await client.patch(
        f"/api/admin/utilisateurs/{identifiant}", json={"role": "contributeur"}, headers=csrf
    )
    await client.patch(
        f"/api/admin/utilisateurs/{identifiant}", json={"suspendu": True}, headers=csrf
    )

    journal = (await client.get("/api/admin/journal")).json()
    assert journal["total"] == 2
    assert journal["actions"][1] == {
        "id": journal["actions"][1]["id"],
        "action": "changement_role",
        "acteur": "chef",
        "cible": "aiko",
        "details": {"avant": "apprenant", "apres": "contributeur"},
        "cree_le": journal["actions"][1]["cree_le"],
    }
    filtre = (await client.get("/api/admin/journal", params={"action": "suspension"})).json()
    assert [a["action"] for a in filtre["actions"]] == ["suspension"]
