"""Les tests utilisent une vraie base PostgreSQL, séparée de celle de développement (ADR 0004)."""

import os
import tempfile

os.environ.setdefault(
    "RENARD_DATABASE_URL", "postgresql+asyncpg://renard:renard@localhost:5433/renard_test"
)
os.environ.setdefault("RENARD_ENVIRONNEMENT", "test")
os.environ.setdefault("RENARD_COOKIE_SECURISE", "false")
# La plupart des tests couvrent le parcours complet, avec confirmation par email.
os.environ.setdefault("RENARD_VERIFICATION_EMAIL", "true")
os.environ.setdefault("RENARD_DOSSIER_MEDIAS", tempfile.mkdtemp(prefix="renard-medias-"))

import asyncio
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config as ConfigAlembic
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app import limiteur
from app.config import get_config
from app.db import Base, engine
from app.dev import creer_base_si_absente
from app.emails import ExpediteurMemoire, get_expediteur
from app.main import app
from app.modeles import __all__ as _tous_les_modeles  # noqa: F401

RACINE_API = Path(__file__).parent.parent


@pytest.fixture(scope="session", autouse=True)
def base_de_test() -> None:
    """Crée la base de test si besoin, puis applique toutes les migrations."""
    try:
        asyncio.run(creer_base_si_absente())
    except OSError:
        pytest.exit("PostgreSQL est injoignable. Lance `docker compose up -d db` dans infra/.")
    command.upgrade(ConfigAlembic(str(RACINE_API / "alembic.ini")), "head")


@pytest.fixture(autouse=True)
async def base_vide() -> AsyncIterator[None]:
    """Chaque test part d'une base vide et de compteurs remis à zéro."""
    yield
    tables = ", ".join(table.name for table in Base.metadata.sorted_tables)
    async with engine.begin() as connexion:
        await connexion.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    for compteur in limiteur.TOUS:
        compteur.vider()


@pytest.fixture(autouse=True)
def boite_mail() -> Iterator[ExpediteurMemoire]:
    """Remplace l'envoi d'emails : les tests lisent les emails dans cette boîte."""
    boite = ExpediteurMemoire()
    app.dependency_overrides[get_expediteur] = lambda: boite
    yield boite
    app.dependency_overrides.pop(get_expediteur)


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://renard.test") as c:
        yield c


@pytest.fixture
def sans_verification() -> Iterator[None]:
    """Comme en production tant qu'il n'y a pas de service d'envoi d'emails (ADR 0023)."""
    config = get_config()
    config.verification_email = False
    yield
    config.verification_email = True
