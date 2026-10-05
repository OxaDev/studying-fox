"""Routes de supervision : savoir si l'API et la base répondent."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session

router = APIRouter(prefix="/sante", tags=["santé"])


class Statut(BaseModel):
    statut: Literal["ok"]


@router.get("")
async def sante() -> Statut:
    """L'API tourne."""
    return Statut(statut="ok")


@router.get("/base")
async def sante_base(session: Annotated[AsyncSession, Depends(get_session)]) -> Statut:
    """L'API tourne et la base de données répond."""
    await session.execute(text("SELECT 1"))
    return Statut(statut="ok")
