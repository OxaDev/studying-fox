"""Format des paquets de leçons (ADR 0019).

Reflet en Pydantic de docs/format-lecon/lecons.schema.json. Les tests vérifient que
l'exemple officiel passe ici aussi : si l'un change, l'autre doit suivre.
"""

import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.imports.illustration import erreurs_svg
from app.lecons.modeles import Niveau

Slug = Annotated[str, Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", max_length=80)]
Langage = Literal["python", "javascript", "vba"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Generation(Strict):
    assiste_par_ia: bool
    outil: str | None = Field(default=None, max_length=100)
    date: str | None = None


class BlocTexte(Strict):
    type: Literal["texte"]
    markdown: str = Field(min_length=1)


class BlocCode(Strict):
    type: Literal["code"]
    langage: Langage
    code: str = Field(min_length=1, max_length=5000)
    executable: bool
    sortie_attendue: str | None = None


class BlocExercice(Strict):
    """Une consigne, un code de départ modifiable et une solution masquée (version 2)."""

    type: Literal["exercice"]
    langage: Langage
    consigne: str = Field(min_length=1, max_length=2000)
    code: str = Field(min_length=1, max_length=5000)
    solution: str = Field(min_length=1, max_length=5000)
    sortie_attendue: str | None = None


class BlocEncadre(Strict):
    type: Literal["encadre"]
    variante: Literal["astuce", "attention", "a_retenir"]
    markdown: str = Field(min_length=1, max_length=1000)


class BlocImage(Strict):
    type: Literal["image"]
    fichier: str = Field(pattern=r"^images/[a-z0-9-]+\.(png|jpg|webp|svg)$")
    alt: str = Field(min_length=5, max_length=250)
    legende: str | None = Field(default=None, max_length=200)
    licence: Literal["creation-originale", "cc-by", "cc-by-sa", "domaine-public"]
    source: str | None = None

    @model_validator(mode="after")
    def source_si_pas_originale(self) -> "BlocImage":
        if self.licence != "creation-originale" and not self.source:
            raise ValueError(
                "La source est obligatoire si l'image n'est pas une création originale."
            )
        return self


class BlocIllustration(Strict):
    """Un SVG écrit dans la leçon, limité par une liste blanche (version 4, ADR 0029)."""

    type: Literal["illustration"]
    svg: str = Field(min_length=10)
    alt: str = Field(min_length=5, max_length=250)
    description: str = Field(min_length=20, max_length=2000)
    # Sans accent grave ni retour à la ligne : elle suit « illustration » dans le Markdown.
    legende: str | None = Field(default=None, max_length=200, pattern=r"^[^`\n]*$")

    @field_validator("svg")
    @classmethod
    def svg_autorise(cls, svg: str) -> str:
        erreurs = erreurs_svg(svg, complet=False)
        if erreurs:
            raise ValueError(" ".join(erreurs[:5]))
        return svg


Bloc = Annotated[
    BlocTexte | BlocCode | BlocExercice | BlocEncadre | BlocImage | BlocIllustration,
    Field(discriminator="type"),
]


class Source(Strict):
    titre: str
    url: str


class LeconImportee(Strict):
    # Identifiant stable de la leçon, obligatoire à partir de la version 3 (ADR 0025).
    id: uuid.UUID | None = None
    slug: Slug
    titre: str = Field(min_length=3, max_length=100)
    resume: str = Field(min_length=20, max_length=300)
    theme: Slug
    niveau: Niveau
    duree_minutes: int = Field(ge=2, le=30)
    prerequis: list[Slug] = []
    objectifs: list[Annotated[str, Field(max_length=150)]] = Field(min_length=1, max_length=5)
    blocs: list[Bloc] = Field(min_length=1)
    sources: list[Source] = []


class ParcoursImporte(Strict):
    id: uuid.UUID | None = None
    slug: Slug
    titre: str = Field(min_length=3, max_length=100)
    description: str = Field(min_length=20, max_length=500)
    niveau: Niveau
    theme: Slug
    # Place dans le thème : 1 pour le premier parcours à suivre (ADR 0030).
    ordre: int | None = Field(default=None, ge=1, le=999)
    lecons: list[Slug] = Field(min_length=1)


class Paquet(Strict):
    format: Literal["renard-etudiant/lecons"]
    # La version 2 ajoute le bloc « exercice », la version 3 les identifiants (ADR 0025),
    # la version 4 le bloc « illustration » (ADR 0029).
    # Les versions précédentes restent acceptées (ADR 0019).
    version: Literal[1, 2, 3, 4]
    generation: Generation | None = None
    parcours: ParcoursImporte | None = None
    lecons: list[LeconImportee] = Field(min_length=1, max_length=50)
