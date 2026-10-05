"""Recherche en français avec PostgreSQL (ADR 0007).

- Plein texte avec la configuration `francais` (migration 0006) : « fonctions » trouve « fonction »
  et « reseau » trouve « réseau ».
- En plus, les titres proches de la saisie (pg_trgm) : « fonctoins » trouve « Les fonctions ».
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import (
    ColumnElement,
    SQLColumnExpression,
    func,
    literal,
    literal_column,
    or_,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.lecons.modeles import Lecon, Niveau, Revision, Theme
from app.lecons.schemas import ThemeLecture
from app.parcours.modeles import Parcours
from app.parcours.service import est_visible, resume
from app.recherche.schemas import ResultatLecon, ResultatParcours, Segment

# Configuration créée par la migration 0006.
CONFIGURATION: ColumnElement[str] = literal_column("'francais'::regconfig")
LIMITE = 50
# Similarité minimale entre la saisie et un mot du titre (de 0 à 1).
SEUIL_SIMILARITE = 0.5
# En dessous, une saisie ressemble à trop de titres pour que la tolérance aux fautes serve.
LONGUEUR_MIN_SIMILARITE = 4

# Caractères à usage privé : ils n'apparaissent pas dans un texte normal.
DEBUT, FIN = "\ue000", "\ue001"
SURLIGNAGE = f"StartSel={DEBUT}, StopSel={FIN}"
OPTIONS_TEXTE_COURT = f"HighlightAll=true, {SURLIGNAGE}"
OPTIONS_EXTRAIT = f'MaxFragments=2, MaxWords=20, MinWords=8, FragmentDelimiter=" … ", {SURLIGNAGE}'

# Syntaxe Markdown retirée du contenu avant d'en tirer un extrait.
NETTOYAGE_MARKDOWN = [
    (r"!?\[([^\]]*)\]\([^)]*\)", r"\1"),  # liens et images : on garde le texte
    (r"\[!\w+\]", " "),  # marqueurs d'encadré
    (r"```[^\n]*", " "),  # délimiteurs des blocs de code
    (r"[#*_`>|]+", " "),
]


@dataclass
class Filtres:
    texte: str
    theme: str | None = None
    niveau: Niveau | None = None


def decouper(surligne: str) -> list[Segment]:
    """Transforme le texte renvoyé par ts_headline en segments, surlignés ou non."""
    segments = []
    for i, morceau in enumerate(surligne.split(DEBUT)):
        dedans, _, apres = morceau.partition(FIN) if i else ("", "", morceau)
        if dedans:
            segments.append(Segment(texte=dedans, surligne=True))
        if apres:
            segments.append(Segment(texte=apres, surligne=False))
    return segments


def _texte_brut(contenu: SQLColumnExpression[str]) -> SQLColumnExpression[str]:
    for motif, remplacement in NETTOYAGE_MARKDOWN:
        contenu = func.regexp_replace(contenu, motif, remplacement, "g")
    return contenu


def _mots(filtres: Filtres) -> ColumnElement[object]:
    return func.websearch_to_tsquery(CONFIGURATION, filtres.texte)


def _correspond(
    filtres: Filtres, vecteur: SQLColumnExpression[str | None], titre: SQLColumnExpression[str]
) -> tuple[ColumnElement[bool], ColumnElement[float]]:
    """Condition de correspondance et score de pertinence pour la saisie."""
    condition: ColumnElement[bool] = vecteur.op("@@")(_mots(filtres))
    score: ColumnElement[float] = func.ts_rank(vecteur, _mots(filtres))
    if len(filtres.texte) >= LONGUEUR_MIN_SIMILARITE:
        similarite = func.word_similarity(func.unaccent(filtres.texte), func.unaccent(titre))
        condition = or_(condition, similarite >= SEUIL_SIMILARITE)
        score = score + similarite
    return condition, score


def _surligner(
    texte: SQLColumnExpression[str], filtres: Filtres, options: str
) -> ColumnElement[str]:
    return func.ts_headline(CONFIGURATION, texte, _mots(filtres), options)


def _criteres(filtres: Filtres, niveau: SQLColumnExpression[Niveau]) -> list[ColumnElement[bool]]:
    criteres = []
    if filtres.theme:
        criteres.append(Theme.slug == filtres.theme)
    if filtres.niveau:
        criteres.append(niveau == filtres.niveau)
    return criteres


async def chercher_lecons(
    db: AsyncSession, filtres: Filtres, terminees: set[uuid.UUID]
) -> list[ResultatLecon]:
    resume_affiche: SQLColumnExpression[str] = Revision.resume
    extrait: SQLColumnExpression[str] = literal("")
    criteres = _criteres(filtres, Lecon.niveau)
    tri: list[ColumnElement[float]] = []
    if filtres.texte:
        condition, score = _correspond(filtres, Revision.recherche, Revision.titre)
        resume_affiche = _surligner(Revision.resume, filtres, OPTIONS_TEXTE_COURT)
        extrait = _surligner(_texte_brut(Revision.contenu), filtres, OPTIONS_EXTRAIT)
        criteres.append(condition)
        tri.append(score.desc())

    requete = (
        select(Lecon, Revision, resume_affiche, extrait)
        .join(Revision, Lecon.revision_publiee_id == Revision.id)
        .join(Theme, Lecon.theme_id == Theme.id)
        .where(*criteres)
        .order_by(*tri, Revision.titre)
        .limit(LIMITE)
    )

    resultats = []
    for lecon, revision, resume_surligne, texte_extrait in await db.execute(requete):
        segments_extrait = decouper(texte_extrait)
        resultats.append(
            ResultatLecon(
                slug=lecon.slug,
                titre=revision.titre,
                theme=ThemeLecture(slug=lecon.theme.slug, nom=lecon.theme.nom),
                niveau=lecon.niveau,
                duree_minutes=revision.duree_minutes,
                terminee=lecon.id in terminees,
                resume=decouper(resume_surligne),
                # Sans mot surligné, l'extrait n'apprend rien de plus que le résumé.
                extrait=segments_extrait if any(s.surligne for s in segments_extrait) else [],
            )
        )
    return resultats


async def chercher_parcours(
    db: AsyncSession, filtres: Filtres, terminees: set[uuid.UUID]
) -> list[ResultatParcours]:
    description: SQLColumnExpression[str] = Parcours.description
    criteres = [Parcours.publie.is_(True), *_criteres(filtres, Parcours.niveau)]
    tri: list[ColumnElement[float]] = []
    if filtres.texte:
        condition, score = _correspond(filtres, Parcours.recherche, Parcours.titre)
        description = _surligner(Parcours.description, filtres, OPTIONS_TEXTE_COURT)
        criteres.append(condition)
        tri.append(score.desc())

    requete = (
        select(Parcours, description)
        .join(Theme, Parcours.theme_id == Theme.id)
        .where(*criteres)
        .order_by(*tri, Parcours.titre)
    )

    resultats = []
    for parcours, description_surlignee in await db.execute(requete):
        # Peu de parcours : on écarte en Python ceux qui n'ont aucune leçon publiée.
        if not est_visible(parcours):
            continue
        avancement = resume(parcours, terminees)
        resultats.append(
            ResultatParcours(
                **avancement.model_dump(exclude={"description"}),
                description=decouper(description_surlignee),
            )
        )
    return resultats[:LIMITE]
