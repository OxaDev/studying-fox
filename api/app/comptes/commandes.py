"""Commandes d'exploitation.

Nommer le premier admin (le compte doit déjà exister) :
    uv run python -m app.comptes.commandes promouvoir-admin <email>
"""

import argparse
import asyncio

from app.admin.journal import journaliser
from app.comptes.modeles import Role
from app.comptes.service import trouver_par_email
from app.db import SessionLocale
from app.modeles import __all__ as _tous_les_modeles  # noqa: F401  (enregistre les tables)


async def promouvoir_admin(email: str) -> None:
    async with SessionLocale() as db:
        utilisateur = await trouver_par_email(db, email.strip().lower())
        if utilisateur is None:
            raise SystemExit(f"Aucun compte pour {email}.")
        journaliser(
            db,
            None,
            "changement_role",
            f"utilisateur:{utilisateur.id}",
            avant=utilisateur.role,
            apres=Role.ADMIN,
            via="ligne de commande",
        )
        utilisateur.role = Role.ADMIN
        await db.commit()
    print(f"{email} est maintenant admin.")


def main() -> None:
    parseur = argparse.ArgumentParser(description=__doc__)
    commandes = parseur.add_subparsers(dest="commande", required=True)
    promotion = commandes.add_parser("promouvoir-admin", help="Donne le rôle admin à un compte.")
    promotion.add_argument("email")
    arguments = parseur.parse_args()

    if arguments.commande == "promouvoir-admin":
        asyncio.run(promouvoir_admin(arguments.email))


if __name__ == "__main__":
    main()
