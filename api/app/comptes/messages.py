"""Textes des emails envoyés aux utilisateurs."""

from app.config import get_config
from app.emails import Email

SIGNATURE = "\n\nÀ bientôt,\nLe Renard Étudiant"


def lien(chemin: str, jeton: str | None = None) -> str:
    adresse = f"{get_config().url_publique}/app/{chemin}"
    return f"{adresse}?jeton={jeton}" if jeton else adresse


def confirmation(destinataire: str, pseudo: str, jeton: str) -> Email:
    return Email(
        destinataire=destinataire,
        sujet="Confirme ton adresse email",
        corps=(
            f"Bonjour {pseudo},\n\n"
            "Bienvenue sur Le Renard Étudiant ! Pour activer ton compte, ouvre ce lien :\n"
            f"{lien('confirmation', jeton)}\n\n"
            "Le lien est valable 48 heures. Si tu n'as pas créé de compte, ignore cet email."
            f"{SIGNATURE}"
        ),
    )


def compte_existant(destinataire: str) -> Email:
    return Email(
        destinataire=destinataire,
        sujet="Tu as déjà un compte",
        corps=(
            "Bonjour,\n\n"
            "Quelqu'un a essayé de créer un compte avec ton adresse, mais tu en as déjà un.\n"
            f"Pour te connecter : {lien('connexion')}\n"
            f"Mot de passe oublié ? {lien('mot-de-passe-oublie')}\n\n"
            "Si ce n'était pas toi, ignore cet email : ton compte ne risque rien."
            f"{SIGNATURE}"
        ),
    )


def reinitialisation(destinataire: str, pseudo: str, jeton: str) -> Email:
    return Email(
        destinataire=destinataire,
        sujet="Choisis un nouveau mot de passe",
        corps=(
            f"Bonjour {pseudo},\n\n"
            "Pour choisir un nouveau mot de passe, ouvre ce lien :\n"
            f"{lien('reinitialisation', jeton)}\n\n"
            "Le lien est valable 1 heure. Si tu n'as rien demandé, ignore cet email."
            f"{SIGNATURE}"
        ),
    )


def changement_email(destinataire: str, pseudo: str, jeton: str) -> Email:
    return Email(
        destinataire=destinataire,
        sujet="Confirme ta nouvelle adresse email",
        corps=(
            f"Bonjour {pseudo},\n\n"
            "Pour utiliser cette adresse sur Le Renard Étudiant, ouvre ce lien :\n"
            f"{lien('confirmation', jeton)}\n\n"
            "Le lien est valable 48 heures."
            f"{SIGNATURE}"
        ),
    )
