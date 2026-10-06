"""Configuration lue depuis les variables d'environnement préfixées par RENARD_."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RENARD_", env_file=".env", extra="ignore")

    environnement: Literal["dev", "test", "prod"] = "dev"
    database_url: str = "postgresql+asyncpg://renard:renard@localhost:5433/renard"

    # Adresse du site vue par l'utilisateur, pour les liens envoyés par email.
    url_publique: str = "http://localhost:5173"

    # Confirmation de l'email par un lien (ADR 0008). Coupée tant qu'il n'y a pas de service
    # d'envoi : l'email reste obligatoire, mais n'est pas vérifié (ADR 0023).
    verification_email: bool = False

    # Cookie de session (ADR 0008). À ne désactiver que pour les tests en HTTP.
    cookie_securise: bool = True
    duree_session_jours: int = 14

    # Images des leçons, servies sous /medias/ (par Caddy en production).
    dossier_medias: Path = Path("medias")

    # Parcours validés, chargés au démarrage s'ils manquent en base (ADR 0025).
    dossier_parcours_valides: Path = Path(__file__).parents[1] / "validated_courses"


@lru_cache
def get_config() -> Config:
    return Config()
