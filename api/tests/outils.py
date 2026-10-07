"""Raccourcis pour les tests : créer un compte, se connecter, lire un email."""

import re
import uuid
from dataclasses import dataclass

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update

from app.comptes.modeles import Role, Utilisateur
from app.db import SessionLocale
from app.emails import ExpediteurMemoire
from app.lecons.modeles import Lecon, Niveau, Revision, StatutRevision, Theme
from app.main import app
from app.parcours.modeles import EtapeParcours, Parcours
from app.temps import maintenant

MOT_DE_PASSE = "un-mot-de-passe-solide"


@dataclass
class Compte:
    email: str
    pseudo: str
    mot_de_passe: str = MOT_DE_PASSE


def nouveau_client() -> AsyncClient:
    """Un second navigateur, avec ses propres cookies."""
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://renard.test")


def jeton_du_dernier_email(boite: ExpediteurMemoire) -> str:
    trouve = re.search(r"jeton=([\w-]+)", boite.envoyes[-1].corps)
    assert trouve, "Aucun lien avec jeton dans le dernier email"
    return trouve.group(1)


async def creer_compte(
    client: AsyncClient,
    boite: ExpediteurMemoire,
    pseudo: str = "aiko",
    role: Role = Role.APPRENANT,
) -> Compte:
    """Inscrit un compte, confirme son email et lui donne le rôle demandé."""
    compte = Compte(email=f"{pseudo}@exemple.fr", pseudo=pseudo)
    reponse = await client.post(
        "/api/comptes/inscription",
        json={"email": compte.email, "pseudo": pseudo, "mot_de_passe": compte.mot_de_passe},
    )
    assert reponse.status_code == 204, reponse.text
    reponse = await client.post(
        "/api/comptes/confirmation", json={"jeton": jeton_du_dernier_email(boite)}
    )
    assert reponse.status_code == 204, reponse.text
    if role is not Role.APPRENANT:
        async with SessionLocale() as db:
            await db.execute(
                update(Utilisateur).where(Utilisateur.email == compte.email).values(role=role)
            )
            await db.commit()
    return compte


async def connecter(client: AsyncClient, compte: Compte) -> dict[str, str]:
    """Connecte le compte et renvoie l'en-tête CSRF à joindre aux requêtes d'écriture."""
    reponse = await client.post(
        "/api/comptes/connexion",
        json={"email": compte.email, "mot_de_passe": compte.mot_de_passe},
    )
    assert reponse.status_code == 200, reponse.text
    return {"X-CSRF-Token": reponse.json()["jeton_csrf"]}


async def creer_lecon(
    slug: str,
    titre: str = "Les variables",
    statut: StatutRevision = StatutRevision.PUBLIEE,
    auteur_email: str | None = None,
    assiste_par_ia: bool = False,
    resume: str = "Stocker une valeur pour la réutiliser.",
    contenu: str = "Une **variable** est une boîte.\n\n```python run\nprint(1)\n```\n",
    niveau: Niveau = Niveau.DEBUTANT,
    identifiant: uuid.UUID | None = None,
    theme_slug: str = "python",
) -> None:
    """Crée une leçon (de thème Python par défaut) avec une révision au statut demandé."""
    async with SessionLocale() as db:
        theme = await db.scalar(select(Theme).where(Theme.slug == theme_slug))
        if theme is None:
            theme = Theme(slug=theme_slug, nom=theme_slug.capitalize())
            db.add(theme)
            await db.flush()
        auteur_id = (
            await db.scalar(select(Utilisateur.id).where(Utilisateur.email == auteur_email))
            if auteur_email
            else None
        )
        lecon = Lecon(id=identifiant or uuid.uuid4(), slug=slug, theme_id=theme.id, niveau=niveau)
        db.add(lecon)
        await db.flush()
        publiee = statut is StatutRevision.PUBLIEE
        revision = Revision(
            lecon_id=lecon.id,
            numero=1,
            titre=titre,
            resume=resume,
            objectifs=["Créer une variable"],
            duree_minutes=8,
            contenu=contenu,
            statut=statut,
            auteur_id=auteur_id,
            assiste_par_ia=assiste_par_ia,
            publiee_le=maintenant() if publiee else None,
        )
        db.add(revision)
        await db.flush()
        if publiee:
            lecon.revision_publiee_id = revision.id
        await db.commit()


async def creer_parcours(
    slug: str,
    lecons: list[str],
    publie: bool = True,
    titre: str | None = None,
    description: str = "Un parcours pour apprendre pas à pas.",
    theme_slug: str = "python",
    ordre: int | None = None,
) -> None:
    """Crée un parcours (de thème Python par défaut) avec les leçons indiquées, dans l'ordre."""
    async with SessionLocale() as db:
        theme = await db.scalar(select(Theme).where(Theme.slug == theme_slug))
        assert theme, "Créer au moins une leçon avant le parcours"
        ids = {
            lecon.slug: lecon.id
            for lecon in await db.scalars(select(Lecon).where(Lecon.slug.in_(lecons)))
        }
        db.add(
            Parcours(
                slug=slug,
                titre=titre or f"Parcours {slug}",
                description=description,
                niveau=Niveau.DEBUTANT,
                theme_id=theme.id,
                ordre=ordre,
                publie=publie,
                etapes=[
                    EtapeParcours(lecon_id=ids[s], position=i) for i, s in enumerate(lecons, 1)
                ],
            )
        )
        await db.commit()


async def creer_themes() -> None:
    """Thèmes de départ (créés par les migrations, mais vidés entre deux tests).

    « python » sert aux données des tests ; « python-bases » est celui de l'exemple officiel.
    """
    async with SessionLocale() as db:
        themes = [
            ("python", "Python"),
            ("javascript", "JavaScript"),
            ("python-bases", "Python - Bases"),
        ]
        for slug, nom in themes:
            if await db.scalar(select(Theme.id).where(Theme.slug == slug)) is None:
                db.add(Theme(slug=slug, nom=nom))
        await db.commit()
