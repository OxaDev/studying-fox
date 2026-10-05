"""Pages publiques : accueil, catalogue, présentation d'un parcours, sitemap et robots.txt.

Elles montrent ce qu'on va apprendre, jamais le contenu des leçons (ADR 0016).
"""

from datetime import datetime
from pathlib import Path
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse, PlainTextResponse, Response
from fastapi.templating import Jinja2Templates
from sqlalchemy import select

from app.comptes.dependances import Db
from app.config import get_config
from app.lecons.modeles import Niveau
from app.parcours.modeles import Parcours
from app.parcours.service import detail, est_visible, parcours_publies

router = APIRouter(include_in_schema=False)

gabarits = Jinja2Templates(directory=Path(__file__).parent / "gabarits")

NIVEAUX = {Niveau.DEBUTANT: "Débutant", Niveau.INTERMEDIAIRE: "Intermédiaire"}
# Couleurs des en-têtes de cartes, dans l'ordre (comme dans l'application).
PASTELS = ["peche", "menthe", "soleil", "sakura", "ciel"]
NB_A_LA_UNE = 3
# Les pages changent rarement : les navigateurs et Caddy peuvent les garder 5 minutes.
CACHE = {"Cache-Control": "public, max-age=300"}


def duree(minutes: int) -> str:
    """45 → « 45 min », 80 → « 1 h 20 »."""
    heures, reste = divmod(minutes, 60)
    if not heures:
        return f"{reste} min"
    return f"{heures} h {reste:02d}" if reste else f"{heures} h"


gabarits.env.filters["duree"] = duree
gabarits.env.globals["NIVEAUX"] = NIVEAUX
gabarits.env.globals["PASTELS"] = PASTELS


def _page(request: Request, gabarit: str, statut: int = 200, **contexte: object) -> HTMLResponse:
    return gabarits.TemplateResponse(
        request,
        gabarit,
        {"url_publique": get_config().url_publique, "chemin": request.url.path, **contexte},
        status_code=statut,
        headers=CACHE if statut == 200 else None,
    )


def page_introuvable(request: Request) -> HTMLResponse:
    return _page(request, "introuvable.html", statut=status.HTTP_404_NOT_FOUND)


@router.get("/")
async def accueil(request: Request, db: Db) -> HTMLResponse:
    parcours = await parcours_publies(db)
    # Les plus récents d'abord.
    a_la_une = sorted(parcours, key=lambda p: p.cree_le, reverse=True)[:NB_A_LA_UNE]
    return _page(request, "accueil.html", parcours=[detail(p, set()) for p in a_la_une])


@router.get("/parcours")
async def catalogue(
    request: Request, db: Db, theme: Annotated[str | None, Query(max_length=80)] = None
) -> HTMLResponse:
    parcours = await parcours_publies(db)
    themes = {p.theme.slug: p.theme.nom for p in parcours}
    affiches = [detail(p, set()) for p in parcours if not theme or p.theme.slug == theme]
    return _page(
        request,
        "catalogue.html",
        parcours=affiches,
        themes=sorted(themes.items(), key=lambda t: t[1]),
        theme_choisi=theme,
        nom_theme=themes.get(theme or ""),
    )


@router.get("/parcours/{slug}")
async def presentation_parcours(request: Request, slug: str, db: Db) -> HTMLResponse:
    parcours = await db.scalar(
        select(Parcours).where(Parcours.slug == slug, Parcours.publie.is_(True))
    )
    if parcours is None or not est_visible(parcours):
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return _page(
        request,
        "parcours.html",
        parcours=detail(parcours, set()),
        # Après connexion, l'application ouvre directement le parcours.
        retour=quote(f"/parcours/{slug}", safe=""),
    )


def _derniere_publication(parcours: Parcours) -> datetime | None:
    dates = [
        etape.lecon.revision_publiee.publiee_le
        for etape in parcours.etapes
        if etape.lecon.revision_publiee and etape.lecon.revision_publiee.publiee_le
    ]
    return max(dates, default=None)


@router.get("/sitemap.xml")
async def sitemap(request: Request, db: Db) -> Response:
    parcours = await parcours_publies(db)
    dates = {p.slug: _derniere_publication(p) for p in parcours}
    plus_recente = max((d for d in dates.values() if d), default=None)
    adresses = [("/", plus_recente), ("/parcours", plus_recente)] + [
        (f"/parcours/{slug}", date) for slug, date in dates.items()
    ]
    return gabarits.TemplateResponse(
        request,
        "sitemap.xml",
        {"url_publique": get_config().url_publique, "adresses": adresses},
        media_type="application/xml",
        headers=CACHE,
    )


@router.get("/robots.txt")
async def robots() -> PlainTextResponse:
    # L'application et l'API ne sont pas référencées (ADR 0020).
    return PlainTextResponse(
        "User-agent: *\n"
        "Disallow: /app/\n"
        "Disallow: /api/\n"
        f"Sitemap: {get_config().url_publique}/sitemap.xml\n",
        headers=CACHE,
    )
