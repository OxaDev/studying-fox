from datetime import datetime

from pydantic import BaseModel

from app.lecons.modeles import Niveau


class ThemeLecture(BaseModel):
    slug: str
    nom: str


class ResumeLecon(BaseModel):
    slug: str
    titre: str
    resume: str
    theme: ThemeLecture
    niveau: Niveau
    duree_minutes: int


class LeconPubliee(ResumeLecon):
    objectifs: list[str]
    contenu: str
    assiste_par_ia: bool
    # Pseudos des auteurs des versions publiées (licence CC BY-SA, ADR 0017).
    auteurs: list[str]
    publiee_le: datetime
    # L'apprenant connecté a-t-il marqué cette leçon comme terminée ?
    terminee: bool
