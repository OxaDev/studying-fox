from datetime import timedelta

from httpx import AsyncClient
from sqlalchemy import func, select, update

from app.admin.modeles import ActionJournal
from app.comptes.modeles import Role, SessionUtilisateur, Utilisateur
from app.db import SessionLocale
from app.emails import ExpediteurMemoire
from app.lecons.modeles import Lecon, Revision, StatutRevision
from app.rgpd.purge import purger
from app.temps import maintenant
from tests.outils import MOT_DE_PASSE, connecter, creer_compte, creer_lecon


async def _compter(modele: type[Utilisateur] | type[Lecon] | type[Revision]) -> int:
    async with SessionLocale() as db:
        return await db.scalar(select(func.count()).select_from(modele)) or 0


# --- Export ------------------------------------------------------------------------------


async def test_telecharger_mes_donnees(client: AsyncClient, boite_mail: ExpediteurMemoire) -> None:
    compte = await creer_compte(client, boite_mail, pseudo="aiko", role=Role.CONTRIBUTEUR)
    csrf = await connecter(client, compte)
    await creer_lecon("les-variables", auteur_email=compte.email)
    await client.put("/api/progression/lecons/les-variables", headers=csrf)

    reponse = await client.get("/api/comptes/moi/export")

    assert reponse.status_code == 200
    assert "attachment" in reponse.headers["content-disposition"]
    assert reponse.headers["cache-control"] == "no-store"
    donnees = reponse.json()
    assert donnees["compte"]["email"] == "aiko@exemple.fr"
    assert donnees["compte"]["pseudo"] == "aiko"
    assert "mot_de_passe_hash" not in str(donnees)
    assert len(donnees["sessions"]) == 1
    assert [t["lecon"] for t in donnees["lecons_terminees"]] == ["les-variables"]
    assert [c["lecon"] for c in donnees["contributions"]] == ["les-variables"]
    assert donnees["contributions"][0]["contenu"].startswith("Une **variable**")


async def test_l_export_exige_une_connexion(client: AsyncClient) -> None:
    assert (await client.get("/api/comptes/moi/export")).status_code == 401


# --- Suppression -------------------------------------------------------------------------


async def test_supprimer_mon_compte_anonymise_les_lecons_publiees(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    compte = await creer_compte(client, boite_mail, pseudo="aiko", role=Role.CONTRIBUTEUR)
    await creer_lecon("publiee", auteur_email=compte.email)
    await creer_lecon("brouillon", auteur_email=compte.email, statut=StatutRevision.EN_RELECTURE)
    csrf = await connecter(client, compte)

    refus = await client.post(
        "/api/comptes/moi/suppression", json={"mot_de_passe": "pas le bon"}, headers=csrf
    )
    assert refus.status_code == 400

    reponse = await client.post(
        "/api/comptes/moi/suppression", json={"mot_de_passe": MOT_DE_PASSE}, headers=csrf
    )

    assert reponse.status_code == 204
    assert 'renard_session=""' in reponse.headers["set-cookie"]
    assert (await client.get("/api/comptes/moi")).status_code == 401
    assert await _compter(Utilisateur) == 0
    # La leçon publiée reste en ligne, sans auteur ; le travail non publié disparaît.
    async with SessionLocale() as db:
        assert list(await db.scalars(select(Lecon.slug))) == ["publiee"]
        assert await db.scalar(select(Revision.auteur_id)) is None
        action = await db.scalar(select(ActionJournal))
    assert action is not None
    assert action.action == "suppression_compte"
    assert action.details == {}

    autre = await creer_compte(client, boite_mail, pseudo="kitsune")
    await connecter(client, autre)
    lecon = (await client.get("/api/lecons/publiee")).json()
    assert lecon["auteurs"] == ["Contributeur anonyme"]


async def test_supprimer_mon_compte_exige_le_jeton_csrf(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await connecter(client, await creer_compte(client, boite_mail))

    reponse = await client.post(
        "/api/comptes/moi/suppression",
        json={"mot_de_passe": MOT_DE_PASSE},
        headers={"X-CSRF-Token": "faux"},
    )

    assert reponse.status_code == 403
    assert await _compter(Utilisateur) == 1


async def test_le_dernier_admin_ne_peut_pas_supprimer_son_compte(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    admin = await creer_compte(client, boite_mail, pseudo="chef", role=Role.ADMIN)
    csrf = await connecter(client, admin)

    reponse = await client.post(
        "/api/comptes/moi/suppression", json={"mot_de_passe": MOT_DE_PASSE}, headers=csrf
    )

    assert reponse.status_code == 409
    assert "seul admin" in reponse.json()["detail"]

    await creer_compte(client, boite_mail, pseudo="adjoint", role=Role.ADMIN)
    reponse = await client.post(
        "/api/comptes/moi/suppression", json={"mot_de_passe": MOT_DE_PASSE}, headers=csrf
    )
    assert reponse.status_code == 204


# --- Purge -------------------------------------------------------------------------------


async def test_purge_des_comptes_non_confirmes_apres_30_jours(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await creer_compte(client, boite_mail, pseudo="confirme")
    for pseudo in ["ancien", "recent"]:
        await client.post(
            "/api/comptes/inscription",
            json={"email": f"{pseudo}@exemple.fr", "pseudo": pseudo, "mot_de_passe": MOT_DE_PASSE},
        )
    async with SessionLocale() as db:
        il_y_a_31_jours = maintenant() - timedelta(days=31)
        await db.execute(
            update(Utilisateur)
            .where(Utilisateur.pseudo.in_(["ancien", "confirme"]))
            .values(cree_le=il_y_a_31_jours)
        )
        await db.commit()

        bilan = await purger(db, maintenant())

        pseudos = set(await db.scalars(select(Utilisateur.pseudo)))
        action = await db.scalar(select(ActionJournal))
    assert bilan.comptes == 1
    assert pseudos == {"confirme", "recent"}
    assert action is not None
    assert action.details == {"nombre": "1"}


async def test_purge_des_sessions_expirees_et_du_vieux_journal(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    await connecter(client, await creer_compte(client, boite_mail))
    async with SessionLocale() as db:
        db.add(
            ActionJournal(action="ancienne", cible="x", cree_le=maintenant() - timedelta(days=400))
        )
        db.add(ActionJournal(action="recente", cible="x"))
        await db.commit()

        # Dans 15 jours, la session de 14 jours a expiré.
        bilan = await purger(db, maintenant() + timedelta(days=15))

        sessions = await db.scalar(select(func.count()).select_from(SessionUtilisateur))
        actions = list(await db.scalars(select(ActionJournal.action)))
    assert bilan.sessions == 1
    assert bilan.actions == 1
    assert sessions == 0
    assert actions == ["recente"]
