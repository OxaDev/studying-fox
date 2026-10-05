"""Hachage des mots de passe (Argon2id) et jetons aléatoires (ADR 0008)."""

import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

_hacheur = PasswordHasher()

# Vérifié quand l'email est inconnu : la réponse prend alors autant de temps,
# ce qui empêche de deviner quels emails ont un compte.
_HASH_LEURRE = _hacheur.hash("leurre-pour-egaliser-le-temps-de-reponse")


def hacher_mot_de_passe(mot_de_passe: str) -> str:
    return _hacheur.hash(mot_de_passe)


def verifier_mot_de_passe(hash_enregistre: str | None, mot_de_passe: str) -> bool:
    try:
        _hacheur.verify(hash_enregistre or _HASH_LEURRE, mot_de_passe)
    except (VerificationError, InvalidHashError):
        return False
    return hash_enregistre is not None


def generer_jeton() -> str:
    return secrets.token_urlsafe(32)


def empreinte(jeton: str) -> str:
    """On ne stocke jamais un jeton en clair, seulement son empreinte SHA-256."""
    return hashlib.sha256(jeton.encode()).hexdigest()
