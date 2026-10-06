"""Point d'entrée de l'API."""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException
from starlette.responses import Response

from app.admin.consultation import router as journal_router
from app.admin.routes import router as admin_router
from app.admin.themes import router as themes_router
from app.comptes.routes import router as comptes_router
from app.config import get_config
from app.contribution.routes import router as contribution_router
from app.imports.parcours_valides import charger_au_demarrage
from app.imports.routes import router as imports_router
from app.lecons.routes import router as lecons_router
from app.parcours.routes import router as parcours_router
from app.progression.routes import router as progression_router
from app.protection import exiger_json_ou_jeton
from app.recherche.routes import router as recherche_router
from app.relecture.routes import router as relecture_router
from app.rgpd.purge import purger_chaque_jour
from app.rgpd.routes import router as rgpd_router
from app.sante.routes import router as sante_router
from app.vitrine.routes import page_introuvable
from app.vitrine.routes import router as vitrine_router

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s : %(message)s")


@asynccontextmanager
async def cycle_de_vie(_: FastAPI) -> AsyncIterator[None]:
    """Charge les parcours validés (ADR 0025) et applique les durées de conservation chaque jour
    (ADR 0014). Rien de tout ça pendant les tests : chacun part d'une base vide."""
    tache = None
    if get_config().environnement != "test":
        await charger_au_demarrage()
        tache = asyncio.create_task(purger_chaque_jour())
    yield
    if tache:
        tache.cancel()


app = FastAPI(
    lifespan=cycle_de_vie,
    title="Le Renard Étudiant — API",
    version="0.1.0",
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url=None,
)

app.middleware("http")(exiger_json_ou_jeton)

app.include_router(sante_router, prefix="/api")
app.include_router(comptes_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(themes_router, prefix="/api")
app.include_router(journal_router, prefix="/api")
app.include_router(rgpd_router, prefix="/api")
app.include_router(lecons_router, prefix="/api")
app.include_router(parcours_router, prefix="/api")
app.include_router(progression_router, prefix="/api")
app.include_router(imports_router, prefix="/api")
app.include_router(relecture_router, prefix="/api")
app.include_router(contribution_router, prefix="/api")
app.include_router(recherche_router, prefix="/api")

# Vitrine publique : tout ce qui n'est ni /api, ni /app, ni /medias (ADR 0020).
app.include_router(vitrine_router)
app.mount(
    "/statique",
    StaticFiles(directory=Path(__file__).parent / "vitrine" / "statique"),
    name="statique",
)


@app.exception_handler(HTTPException)
async def erreur_http(request: Request, erreur: HTTPException) -> Response:
    """Hors de l'API, une page introuvable est une page HTML de la vitrine."""
    if erreur.status_code == 404 and not request.url.path.startswith("/api/"):
        return page_introuvable(request)
    return await http_exception_handler(request, erreur)


# En production, Caddy sert les images. En développement, c'est l'API (via le proxy de Vite).
if get_config().environnement == "dev":
    dossier_medias = get_config().dossier_medias
    dossier_medias.mkdir(parents=True, exist_ok=True)
    app.mount("/medias", StaticFiles(directory=dossier_medias), name="medias")
