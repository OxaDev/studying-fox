import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field

from app.imports.format import Slug
from app.lecons.modeles import Niveau, StatutRevision
from app.lecons.schemas import ThemeLecture
from app.relecture.modeles import Decision

# Mêmes limites que le format d'import (docs/format-lecon) : les deux circuits se valent.
TITRE_MIN, TITRE_MAX = 3, 100
RESUME_MIN, RESUME_MAX = 20, 300
OBJECTIFS_MAX, OBJECTIF_MAX = 5, 150
DUREE_MIN, DUREE_MAX = 2, 30
CONTENU_MAX = 50_000


class NouvelleLecon(BaseModel):
    slug: Slug
    titre: str = Field(min_length=TITRE_MIN, max_length=TITRE_MAX)
    theme: Slug
    niveau: Niveau


class ContenuBrouillon(BaseModel):
    """Un brouillon peut être incomplet : seules les longueurs maximales sont vérifiées ici."""

    titre: str = Field(max_length=TITRE_MAX)
    resume: str = Field(max_length=RESUME_MAX)
    objectifs: list[Annotated[str, Field(max_length=OBJECTIF_MAX)]] = Field(
        max_length=OBJECTIFS_MAX
    )
    duree_minutes: int = Field(ge=DUREE_MIN, le=DUREE_MAX)
    contenu: str = Field(max_length=CONTENU_MAX)
    # Modifiables seulement pour une leçon jamais publiée.
    theme: Slug | None = None
    niveau: Niveau | None = None


class Soumission(BaseModel):
    # Obligatoire la première fois : licence CC BY-SA 4.0 (ADR 0017).
    accepte_licence: bool = False


class ElementContribution(BaseModel):
    revision_id: uuid.UUID
    lecon_slug: str
    titre: str
    numero: int
    statut: StatutRevision
    nouvelle_lecon: bool
    modifiee_le: datetime


class Retour(BaseModel):
    decision: Decision
    relecteur: str
    commentaire: str | None
    cree_le: datetime


class Contribution(BaseModel):
    revision_id: uuid.UUID
    lecon_slug: str
    numero: int
    statut: StatutRevision
    titre: str
    resume: str
    objectifs: list[str]
    duree_minutes: int
    contenu: str
    theme: ThemeLecture
    niveau: Niveau
    # Leçon jamais publiée : son thème et son niveau sont encore modifiables.
    nouvelle_lecon: bool
    modifiee_le: datetime
    retours: list[Retour]
