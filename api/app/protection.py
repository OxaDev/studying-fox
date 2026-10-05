"""Protection CSRF de premier niveau (ADR 0008).

Un site malveillant peut faire envoyer un formulaire HTML à notre API, mais il ne peut
ni choisir le type `application/json`, ni ajouter un en-tête personnalisé.
Toute requête d'écriture doit donc avoir l'un ou l'autre.
Les routes connectées vérifient en plus la valeur du jeton CSRF (comptes/dependances.py).
"""

from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse

EN_TETE_CSRF = "X-CSRF-Token"
METHODES_ECRITURE = {"POST", "PUT", "PATCH", "DELETE"}


async def exiger_json_ou_jeton(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    if request.method in METHODES_ECRITURE and request.url.path.startswith("/api/"):
        type_contenu = request.headers.get("content-type", "")
        if not type_contenu.startswith("application/json") and EN_TETE_CSRF not in request.headers:
            return JSONResponse(
                status_code=415,
                content={"detail": "Requête refusée : type de contenu non autorisé."},
            )
    return await call_next(request)
