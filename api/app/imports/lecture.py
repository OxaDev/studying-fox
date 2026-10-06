"""Lecture d'un fichier importé : JSON seul, ou archive ZIP avec ses images (ADR 0019).

Tout ce qui vient du fichier est considéré comme hostile : tailles, noms et contenus sont vérifiés.
"""

import io
import json
import re
import zipfile
from dataclasses import dataclass, field

from pydantic import ValidationError
from pydantic_core import ErrorDetails

from app.imports.format import Paquet

TAILLE_MAX_FICHIER = 20 * 1024 * 1024
TAILLE_MAX_DECOMPRESSEE = 50 * 1024 * 1024
TAILLE_MAX_IMAGE = 2 * 1024 * 1024
NOMBRE_MAX_FICHIERS = 200
NOM_IMAGE = re.compile(r"^images/[a-z0-9-]+\.(png|jpg|webp|svg)$")


@dataclass
class Erreur:
    emplacement: str
    message: str


@dataclass
class FichierLu:
    paquet: Paquet | None
    images: dict[str, bytes] = field(default_factory=dict)
    erreurs: list[Erreur] = field(default_factory=list)


def _signature_valide(nom: str, contenu: bytes) -> bool:
    """Vérifie que le contenu correspond bien à l'extension annoncée."""
    if nom.endswith(".png"):
        return contenu.startswith(b"\x89PNG\r\n\x1a\n")
    if nom.endswith(".jpg"):
        return contenu.startswith(b"\xff\xd8\xff")
    if nom.endswith(".webp"):
        return contenu[:4] == b"RIFF" and contenu[8:12] == b"WEBP"
    debut = contenu[:1024].lstrip(b"\xef\xbb\xbf \t\r\n").lower()
    return debut.startswith(b"<") and b"<svg" in contenu[:4096].lower()


def _lire_zip(contenu: bytes, erreurs: list[Erreur]) -> tuple[bytes | None, dict[str, bytes]]:
    try:
        archive = zipfile.ZipFile(io.BytesIO(contenu))
    except zipfile.BadZipFile:
        erreurs.append(Erreur("fichier", "L'archive ZIP est illisible."))
        return None, {}

    entrees = [e for e in archive.infolist() if not e.is_dir()]
    if len(entrees) > NOMBRE_MAX_FICHIERS:
        erreurs.append(
            Erreur("fichier", f"L'archive contient plus de {NOMBRE_MAX_FICHIERS} fichiers.")
        )
        return None, {}
    if sum(e.file_size for e in entrees) > TAILLE_MAX_DECOMPRESSEE:
        erreurs.append(Erreur("fichier", "L'archive est trop volumineuse une fois décompressée."))
        return None, {}

    json_brut: bytes | None = None
    images: dict[str, bytes] = {}
    for entree in entrees:
        nom = entree.filename
        if nom == "lecons.json":
            json_brut = archive.read(entree)
        elif NOM_IMAGE.match(nom):
            if entree.file_size > TAILLE_MAX_IMAGE:
                erreurs.append(Erreur(nom, "Image trop lourde (2 Mo maximum)."))
                continue
            image = archive.read(entree)
            if not _signature_valide(nom, image):
                erreurs.append(
                    Erreur(nom, "Le contenu ne correspond pas à l'extension du fichier.")
                )
                continue
            images[nom] = image
        else:
            erreurs.append(Erreur(nom, "Fichier non autorisé dans l'archive."))
    if json_brut is None:
        erreurs.append(Erreur("fichier", "L'archive doit contenir lecons.json à sa racine."))
    return json_brut, images


# Messages en français pour les erreurs de validation les plus courantes.
MESSAGES = {
    "missing": "Champ obligatoire manquant.",
    "extra_forbidden": "Champ inconnu.",
    "string_too_short": "Texte trop court ({min_length} caractères minimum).",
    "string_too_long": "Texte trop long ({max_length} caractères maximum).",
    "string_pattern_mismatch": "Format invalide.",
    "too_short": "Liste trop courte ({min_length} élément(s) minimum).",
    "too_long": "Liste trop longue ({max_length} éléments maximum).",
    "greater_than_equal": "Doit être au moins {ge}.",
    "less_than_equal": "Doit être au plus {le}.",
    "int_parsing": "Doit être un nombre entier.",
    "int_type": "Doit être un nombre entier.",
    "string_type": "Doit être un texte.",
    "bool_type": "Doit valoir true ou false.",
    "list_type": "Doit être une liste.",
    "enum": "Valeur non autorisée. Valeurs possibles : {expected}.",
    "literal_error": "Valeur non autorisée. Attendu : {expected}.",
    "union_tag_invalid": "Type de bloc inconnu. Types possibles : {expected_tags}.",
    "union_tag_not_found": "Le champ « type » est obligatoire.",
    "uuid_parsing": "Doit être un UUID, par exemple 3f6c2a1e-8b4d-4c2a-9f1e-2d7b5a9c0e41.",
    "uuid_type": "Doit être un UUID, par exemple 3f6c2a1e-8b4d-4c2a-9f1e-2d7b5a9c0e41.",
}


def _message(erreur: ErrorDetails) -> str:
    modele = MESSAGES.get(erreur["type"])
    if modele is None:
        return str(erreur["msg"]).removeprefix("Value error, ")
    try:
        contexte = {
            cle: str(valeur).replace(" or ", " ou ")
            for cle, valeur in erreur.get("ctx", {}).items()
        }
        return modele.format(**contexte)
    except KeyError:
        return str(erreur["msg"])


def _slug_de_la_lecon(brut: object, index: int) -> str | None:
    lecons = brut.get("lecons") if isinstance(brut, dict) else None
    lecon = lecons[index] if isinstance(lecons, list) and index < len(lecons) else None
    slug = lecon.get("slug") if isinstance(lecon, dict) else None
    return slug if isinstance(slug, str) else None


def _emplacement(chemin: tuple[int | str, ...], brut: object) -> str:
    """Chemin lisible d'une erreur.

    ('lecons', 0, 'blocs', 2, 'code', 'code') devient « Leçon « slug » › bloc 3 › code ».
    """
    morceaux: list[str] = []
    i = 0
    while i < len(chemin):
        cle = chemin[i]
        suivant = chemin[i + 1] if i + 1 < len(chemin) else None
        if cle == "lecons" and isinstance(suivant, int) and i == 0:
            slug = _slug_de_la_lecon(brut, suivant)
            morceaux.append(f"Leçon « {slug} »" if slug else f"Leçon {suivant + 1}")
            i += 2
        elif cle == "blocs" and isinstance(suivant, int):
            morceaux.append(f"bloc {suivant + 1}")
            # Pydantic ajoute le type du bloc dans le chemin : on le saute.
            i += (
                3
                if i + 2 < len(chemin) and chemin[i + 2] in ("texte", "code", "encadre", "image")
                else 2
            )
        elif isinstance(cle, int):
            morceaux.append(f"élément {cle + 1}")
            i += 1
        else:
            morceaux.append(str(cle))
            i += 1
    return " › ".join(morceaux) or "fichier"


def lire_fichier(nom_fichier: str, contenu: bytes) -> FichierLu:
    erreurs: list[Erreur] = []
    if len(contenu) > TAILLE_MAX_FICHIER:
        return FichierLu(None, erreurs=[Erreur("fichier", "Fichier trop lourd (20 Mo maximum).")])

    images: dict[str, bytes] = {}
    if nom_fichier.lower().endswith(".zip"):
        json_brut, images = _lire_zip(contenu, erreurs)
    elif nom_fichier.lower().endswith(".json"):
        json_brut = contenu
    else:
        return FichierLu(
            None, erreurs=[Erreur("fichier", "Le fichier doit être un .json ou un .zip.")]
        )
    if json_brut is None:
        return FichierLu(None, images, erreurs)

    try:
        brut = json.loads(json_brut)
    except (json.JSONDecodeError, UnicodeDecodeError) as erreur:
        erreurs.append(Erreur("lecons.json", f"JSON invalide : {erreur}"))
        return FichierLu(None, images, erreurs)

    try:
        paquet = Paquet.model_validate(brut)
    except ValidationError as validation:
        for detail in validation.errors():
            erreurs.append(Erreur(_emplacement(detail["loc"], brut), _message(detail)))
        return FichierLu(None, images, erreurs)
    return FichierLu(paquet, images, erreurs)
