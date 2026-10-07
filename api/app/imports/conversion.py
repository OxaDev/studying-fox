"""Conversion des blocs d'un paquet en Markdown, le format de stockage (ADR 0006, 0019).

La syntaxe produite est décrite dans docs/markdown-lecons.md.
"""

import re

from app.imports.format import (
    Bloc,
    BlocCode,
    BlocEncadre,
    BlocExercice,
    BlocIllustration,
    BlocImage,
    BlocTexte,
    LeconImportee,
)
from app.imports.illustration import svg_complet


def _cloture(code: str) -> str:
    """Une clôture plus longue que toute suite de ``` présente dans le code."""
    plus_longue = max((len(m) for m in re.findall(r"`{3,}", code)), default=2)
    return "`" * (plus_longue + 1)


def _bloc_de_code(code: str, info: str) -> str:
    cloture = _cloture(code)
    return f"{cloture}{info}\n{code.rstrip()}\n{cloture}"


def _citation(lignes: list[str]) -> str:
    return "\n".join(f"> {ligne}" if ligne else ">" for ligne in lignes)


def bloc_en_markdown(bloc: Bloc, medias: str = "/medias") -> str:
    """`medias` : adresse du dossier où les images du paquet sont copiées."""
    match bloc:
        case BlocTexte():
            return bloc.markdown.strip()
        case BlocCode():
            info = f"{bloc.langage} run" if bloc.executable else bloc.langage
            return _bloc_de_code(bloc.code, info)
        case BlocExercice():
            return _citation(
                [
                    "[!exercice]",
                    *bloc.consigne.strip().splitlines(),
                    "",
                    *_bloc_de_code(bloc.code, f"{bloc.langage} run").splitlines(),
                    "",
                    *_bloc_de_code(bloc.solution, f"{bloc.langage} solution").splitlines(),
                ]
            )
        case BlocEncadre():
            lignes = [f"[!{bloc.variante}]", *bloc.markdown.strip().splitlines()]
            return "\n".join(f"> {ligne}".rstrip() for ligne in lignes)
        case BlocImage():
            legende = f' "{bloc.legende}"' if bloc.legende else ""
            return f"![{bloc.alt}]({medias}/{bloc.fichier}{legende})"
        case BlocIllustration():
            info = f"illustration {bloc.legende}" if bloc.legende else "illustration"
            return _bloc_de_code(svg_complet(bloc.svg, bloc.alt, bloc.description), info)


def lecon_en_markdown(lecon: LeconImportee, medias: str = "/medias") -> str:
    parties = [bloc_en_markdown(bloc, medias) for bloc in lecon.blocs]
    if lecon.sources:
        liens = "\n".join(f"- [{source.titre}]({source.url})" for source in lecon.sources)
        parties.append(f"## Pour aller plus loin\n\n{liens}")
    return "\n\n".join(parties) + "\n"
