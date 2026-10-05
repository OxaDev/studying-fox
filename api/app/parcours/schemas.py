from pydantic import BaseModel

from app.lecons.modeles import Niveau
from app.lecons.schemas import ThemeLecture


class ResumeParcours(BaseModel):
    slug: str
    titre: str
    description: str
    niveau: Niveau
    theme: ThemeLecture
    nb_lecons: int
    nb_terminees: int
    duree_minutes: int


class EtapeLecture(BaseModel):
    slug: str
    titre: str
    duree_minutes: int
    terminee: bool


class ParcoursDetail(ResumeParcours):
    lecons: list[EtapeLecture]
    # Première leçon non terminée, pour « Commencer » ou « Continuer ». None si tout est fini.
    prochaine_lecon: str | None


class Espace(BaseModel):
    """Tableau de bord de l'apprenant (cadrage § 5.3)."""

    lecons_terminees: int
    # Avancement sur l'ensemble des parcours commencés, de 0 à 100.
    pourcentage: int
    parcours_en_cours: list[ResumeParcours]
    parcours_termines: list[ResumeParcours]
