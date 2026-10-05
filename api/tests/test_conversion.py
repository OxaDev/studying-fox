import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.imports.conversion import bloc_en_markdown, lecon_en_markdown
from app.imports.format import BlocCode, BlocEncadre, BlocExercice, BlocImage, BlocTexte, Paquet

EXEMPLE = Path(__file__).parents[2] / "docs" / "format-lecon" / "exemple.json"


def test_l_exemple_officiel_est_valide() -> None:
    paquet = Paquet.model_validate_json(EXEMPLE.read_text(encoding="utf-8"))

    assert [lecon.slug for lecon in paquet.lecons] == [
        "afficher-du-texte-en-python",
        "les-variables-en-python",
    ]


def test_un_slug_invalide_est_refuse() -> None:
    donnees = json.loads(EXEMPLE.read_text(encoding="utf-8"))
    donnees["lecons"][0]["slug"] = "Pas Un Slug"

    with pytest.raises(ValidationError):
        Paquet.model_validate(donnees)


def test_une_image_sous_licence_externe_exige_sa_source() -> None:
    with pytest.raises(ValidationError):
        BlocImage(type="image", fichier="images/chat.png", alt="Un chat", licence="cc-by")


def test_texte() -> None:
    assert bloc_en_markdown(BlocTexte(type="texte", markdown="  Du **gras**.\n")) == "Du **gras**."


def test_code_executable() -> None:
    bloc = BlocCode(type="code", langage="python", code='print("Bonjour")\n', executable=True)

    assert bloc_en_markdown(bloc) == '```python run\nprint("Bonjour")\n```'


def test_code_non_executable() -> None:
    bloc = BlocCode(type="code", langage="javascript", code="let x = 1;", executable=False)

    assert bloc_en_markdown(bloc) == "```javascript\nlet x = 1;\n```"


def test_code_qui_contient_des_backticks() -> None:
    bloc = BlocCode(type="code", langage="python", code='s = """\n```\n"""', executable=False)

    assert bloc_en_markdown(bloc).startswith("````python\n")
    assert bloc_en_markdown(bloc).endswith("\n````")


def test_encadre() -> None:
    bloc = BlocEncadre(type="encadre", variante="astuce", markdown="Ligne 1\n\nLigne 2")

    assert bloc_en_markdown(bloc) == "> [!astuce]\n> Ligne 1\n>\n> Ligne 2"


def test_image() -> None:
    bloc = BlocImage(
        type="image",
        fichier="images/schema.png",
        alt="Une boîte nommée prenom",
        legende="Une variable",
        licence="creation-originale",
    )

    assert (
        bloc_en_markdown(bloc)
        == '![Une boîte nommée prenom](/medias/images/schema.png "Une variable")'
    )


def test_lecon_complete() -> None:
    paquet = Paquet.model_validate_json(EXEMPLE.read_text(encoding="utf-8"))

    markdown = lecon_en_markdown(paquet.lecons[0])

    assert markdown.startswith("Pour qu'un programme **affiche**")
    assert '```python run\nprint("Bonjour !")\n```' in markdown
    assert "> [!astuce]" in markdown


def test_exercice() -> None:
    bloc = BlocExercice(
        type="exercice",
        langage="python",
        consigne="Écris une fonction `double`.\n\nElle renvoie le double de `x`.",
        code="def double(x):\n    ...\n",
        solution="def double(x):\n\n    return x * 2\n",
    )

    assert bloc_en_markdown(bloc) == (
        "> [!exercice]\n"
        "> Écris une fonction `double`.\n"
        ">\n"
        "> Elle renvoie le double de `x`.\n"
        ">\n"
        "> ```python run\n"
        "> def double(x):\n"
        ">     ...\n"
        "> ```\n"
        ">\n"
        "> ```python solution\n"
        "> def double(x):\n"
        ">\n"
        ">     return x * 2\n"
        "> ```"
    )


def test_un_paquet_en_version_3_est_refuse() -> None:
    donnees = json.loads(EXEMPLE.read_text(encoding="utf-8"))
    donnees["version"] = 3

    with pytest.raises(ValidationError):
        Paquet.model_validate(donnees)
