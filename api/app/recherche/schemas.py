import enum

from pydantic import BaseModel

from app.lecons.modeles import Niveau
from app.lecons.schemas import ThemeLecture


class TypeResultat(enum.StrEnum):
    LECON = "lecon"
    PARCOURS = "parcours"


class Segment(BaseModel):
    """Morceau de texte. Les mots trouvés sont dans des segments surlignés."""

    texte: str
    surligne: bool


class ResultatLecon(BaseModel):
    slug: str
    titre: str
    theme: ThemeLecture
    niveau: Niveau
    duree_minutes: int
    terminee: bool
    resume: list[Segment]
    # Passage du contenu où les mots apparaissent. Vide s'ils n'y sont pas.
    extrait: list[Segment]


class ResultatParcours(BaseModel):
    slug: str
    titre: str
    theme: ThemeLecture
    niveau: Niveau
    nb_lecons: int
    nb_terminees: int
    duree_minutes: int
    description: list[Segment]


class Resultats(BaseModel):
    parcours: list[ResultatParcours]
    lecons: list[ResultatLecon]
