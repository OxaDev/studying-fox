"""Importe tous les modèles, pour qu'Alembic et les tests voient toutes les tables."""

from app.admin.modeles import ActionJournal
from app.comptes.modeles import JetonEmail, SessionUtilisateur, Utilisateur
from app.imports.modeles import Import
from app.lecons.modeles import Lecon, Revision, Theme
from app.parcours.modeles import EtapeParcours, Parcours
from app.progression.modeles import LeconTerminee
from app.relecture.modeles import Relecture

__all__ = [
    "ActionJournal",
    "EtapeParcours",
    "Import",
    "JetonEmail",
    "Lecon",
    "LeconTerminee",
    "Parcours",
    "Relecture",
    "Revision",
    "SessionUtilisateur",
    "Theme",
    "Utilisateur",
]
