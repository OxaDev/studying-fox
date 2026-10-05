"""Connexion à PostgreSQL (ADR 0005) et session SQLAlchemy par requête."""

import enum
from collections.abc import AsyncIterator

from sqlalchemy import Enum, MetaData
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_config

# Noms de contraintes stables, pour des migrations Alembic prévisibles.
CONVENTION_NOMS = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Classe mère de tous les modèles. Alembic s'en sert pour détecter les tables."""

    metadata = MetaData(naming_convention=CONVENTION_NOMS)


def enum_pg[E: enum.StrEnum](classe: type[E], nom: str) -> Enum:
    """Type énuméré PostgreSQL qui stocke les valeurs (« apprenant ») et non les noms."""
    return Enum(classe, name=nom, values_callable=lambda membres: [m.value for m in membres])


engine = create_async_engine(get_config().database_url, pool_pre_ping=True)
SessionLocale = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """Dépendance FastAPI : une session par requête, fermée à la fin."""
    async with SessionLocale() as session:
        yield session
