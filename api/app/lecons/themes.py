"""Les thèmes par défaut de la plateforme, et l'ordre du catalogue (ADR 0030)."""

from app.lecons.modeles import Theme

# Créés au démarrage s'ils manquent. Leur ordre est celui dans lequel on les aborde.
NOMS_THEMES = {
    "python-bases": "Python - Bases",
    "python-poo": "Python - Programmation Orientée Objet",
    "python-django": "Python - Django",
    "python-fastapi": "Python - Suite FastAPI",
    "javascript": "JavaScript",
    "vba-bases": "VBA - Bases",
    "daggerheart": "JDR - DaggerHeart",
}
RANGS = {slug: rang for rang, slug in enumerate(NOMS_THEMES)}


def rang_du_theme(theme: Theme) -> tuple[int, str]:
    """Clé de tri : les thèmes par défaut dans leur ordre, puis les autres par nom."""
    return RANGS.get(theme.slug, len(RANGS)), theme.nom
