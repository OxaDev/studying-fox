import uuid
from typing import Annotated

from pydantic import AfterValidator, BaseModel, EmailStr, Field, StringConstraints

from app.comptes.modeles import Role


def _minuscules(valeur: str) -> str:
    return valeur.lower()


Email = Annotated[EmailStr, AfterValidator(_minuscules)]

# 12 caractères minimum, sans règle de composition (recommandation NIST et CNIL).
MotDePasse = Annotated[str, Field(min_length=12, max_length=128)]
MotDePasseSaisi = Annotated[str, Field(min_length=1, max_length=128)]

Pseudo = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=3, max_length=30, pattern=r"^[\w.-]+$")
]


class Inscription(BaseModel):
    email: Email
    pseudo: Pseudo
    mot_de_passe: MotDePasse


class Connexion(BaseModel):
    email: Email
    mot_de_passe: MotDePasseSaisi


class JetonRecu(BaseModel):
    jeton: str = Field(min_length=1, max_length=100)


class DemandeParEmail(BaseModel):
    email: Email


class Reinitialisation(BaseModel):
    jeton: str = Field(min_length=1, max_length=100)
    nouveau: MotDePasse


class ChangementMotDePasse(BaseModel):
    actuel: MotDePasseSaisi
    nouveau: MotDePasse


class ChangementEmail(BaseModel):
    nouvel_email: Email
    mot_de_passe: MotDePasseSaisi


class ModificationProfil(BaseModel):
    pseudo: Pseudo


class Moi(BaseModel):
    """L'utilisateur connecté. Le jeton CSRF est à renvoyer dans l'en-tête X-CSRF-Token."""

    id: uuid.UUID
    email: str
    pseudo: str
    role: Role
    # A-t-il déjà accepté la licence CC BY-SA des contenus (ADR 0017) ?
    licence_acceptee: bool
    jeton_csrf: str


class Reglages(BaseModel):
    """Réglages publics des comptes, pour adapter les écrans du front."""

    # Faut-il confirmer son email par un lien (inscription, changement d'adresse) ?
    verification_email: bool
