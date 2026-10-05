"""Recherche dans les leçons et les parcours publiés (cadrage § 5.4)."""

from typing import Annotated

from fastapi import APIRouter, Query

from app.comptes.dependances import Db, Lecture
from app.lecons.modeles import Niveau
from app.parcours.service import lecons_terminees
from app.recherche.schemas import Resultats, TypeResultat
from app.recherche.service import Filtres, chercher_lecons, chercher_parcours

router = APIRouter(prefix="/recherche", tags=["recherche"])


@router.get("")
async def rechercher(
    connecte: Lecture,
    db: Db,
    q: Annotated[str, Query(max_length=200, description="Mots recherchés")] = "",
    theme: Annotated[str | None, Query(max_length=80)] = None,
    niveau: Niveau | None = None,
    type_: Annotated[TypeResultat | None, Query(alias="type")] = None,
) -> Resultats:
    """Sans mots, renvoie tout ce qui correspond aux filtres, par ordre alphabétique."""
    filtres = Filtres(texte=q.strip(), theme=theme, niveau=niveau)
    terminees = await lecons_terminees(db, connecte.utilisateur.id)
    return Resultats(
        parcours=(
            await chercher_parcours(db, filtres, terminees)
            if type_ in (None, TypeResultat.PARCOURS)
            else []
        ),
        lecons=(
            await chercher_lecons(db, filtres, terminees)
            if type_ in (None, TypeResultat.LECON)
            else []
        ),
    )
