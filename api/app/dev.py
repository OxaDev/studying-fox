"""Outils de développement et de test. Refusés en production.

Préparer la base des tests de bout en bout (Playwright) :
    uv run python -m app.dev preparer-e2e
"""

import argparse
import asyncio

import asyncpg
from sqlalchemy import make_url, text

from app.comptes.modeles import Role, Utilisateur
from app.comptes.securite import hacher_mot_de_passe
from app.config import get_config
from app.db import Base, SessionLocale, engine
from app.lecons.modeles import Theme
from app.modeles import __all__ as _tous_les_modeles  # noqa: F401  (enregistre les tables)
from app.temps import maintenant

COMPTES_E2E = [
    ("relectrice@exemple.fr", "relectrice", Role.RELECTEUR),
    ("apprenant@exemple.fr", "apprenant", Role.APPRENANT),
    ("contributeur@exemple.fr", "contributeur", Role.CONTRIBUTEUR),
    ("admin@exemple.fr", "admin", Role.ADMIN),
    # Supprime son compte pendant les tests.
    ("partant@exemple.fr", "partant", Role.APPRENANT),
]
MOT_DE_PASSE_E2E = "mot-de-passe-de-test"


async def creer_base_si_absente() -> None:
    url = make_url(get_config().database_url)
    connexion = await asyncpg.connect(
        user=url.username, password=url.password, host=url.host, port=url.port, database="postgres"
    )
    try:
        if not await connexion.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", url.database
        ):
            await connexion.execute(f'CREATE DATABASE "{url.database}"')
    finally:
        await connexion.close()


async def preparer_e2e() -> None:
    """Vide toutes les tables, puis crée les thèmes et des comptes confirmés."""
    tables = ", ".join(table.name for table in Base.metadata.sorted_tables)
    async with engine.begin() as connexion:
        await connexion.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    async with SessionLocale() as db:
        db.add_all([Theme(slug="python", nom="Python"), Theme(slug="javascript", nom="JavaScript")])
        for email, pseudo, role in COMPTES_E2E:
            db.add(
                Utilisateur(
                    email=email,
                    pseudo=pseudo,
                    role=role,
                    mot_de_passe_hash=hacher_mot_de_passe(MOT_DE_PASSE_E2E),
                    email_verifie_le=maintenant(),
                )
            )
        await db.commit()
    print("Base de bout en bout prête.")


def main() -> None:
    if get_config().environnement == "prod":
        raise SystemExit("Commande réservée au développement et aux tests.")
    parseur = argparse.ArgumentParser(description=__doc__)
    commandes = parseur.add_subparsers(dest="commande", required=True)
    commandes.add_parser("creer-base", help="Crée la base configurée si elle n'existe pas.")
    commandes.add_parser("preparer-e2e", help="Vide la base et crée les comptes de test.")
    arguments = parseur.parse_args()

    if arguments.commande == "creer-base":
        asyncio.run(creer_base_si_absente())
    elif arguments.commande == "preparer-e2e":
        asyncio.run(preparer_e2e())


if __name__ == "__main__":
    main()
