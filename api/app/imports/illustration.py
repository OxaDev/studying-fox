"""Contrôle des illustrations vectorielles (ADR 0029).

Le SVG d'une illustration est écrit dans la leçon. Seuls les éléments et attributs de la liste
blanche sont acceptés, et les couleurs sont des noms de la palette, jamais des codes.
La liste blanche est une copie exacte de celle du front, qui refait le même contrôle à l'affichage.
"""

import html
import json
import re
from pathlib import Path
from typing import TypedDict
from xml.etree import ElementTree

NS_SVG = "http://www.w3.org/2000/svg"


class _Couleurs(TypedDict):
    theme: list[str]
    fixes: list[str]


class _Regles(TypedDict):
    taille_max: int
    elements_max: int
    elements: list[str]
    avec_texte: list[str]
    attributs: dict[str, str]
    formats: dict[str, str]
    couleurs: _Couleurs


REGLES: _Regles = json.loads(
    (Path(__file__).parent / "illustration_regles.json").read_text(encoding="utf-8")
)
ELEMENTS = frozenset(REGLES["elements"])
AVEC_TEXTE = frozenset(REGLES["avec_texte"])
FORMATS = {nom: re.compile(motif) for nom, motif in REGLES["formats"].items()}
COULEURS = [*REGLES["couleurs"]["theme"], *REGLES["couleurs"]["fixes"]]
DOCTYPE = re.compile(r"<!(DOCTYPE|ENTITY)", re.IGNORECASE)
# Balise ouvrante du <svg> racine. Aucune valeur d'attribut acceptée ne contient « > ».
OUVERTURE_SVG = re.compile(r"<svg(\s[^>]*)?>")


def _nom(cle: str) -> tuple[str, str | None]:
    """« {espace}nom » devient (nom, espace)."""
    if cle.startswith("{"):
        espace, _, nom = cle[1:].partition("}")
        return nom, espace
    return cle, None


def _erreur_de_valeur(attribut: str, valeur: str) -> str | None:
    genre = REGLES["attributs"][attribut]
    if genre == "couleur":
        if valeur in COULEURS or valeur == "none" or FORMATS["url"].fullmatch(valeur):
            return None
        return (
            f"Couleur « {valeur} » non autorisée dans « {attribut} ». "
            f"Couleurs possibles : {', '.join(COULEURS)}, none, ou url(#id) pour un dégradé."
        )
    if FORMATS[genre].fullmatch(valeur):
        return None
    return f"Valeur « {valeur} » non autorisée pour « {attribut} »."


class _Controle:
    def __init__(self) -> None:
        self.erreurs: list[str] = []
        self.elements = 0
        self.titres = 0
        self.descriptions = 0

    def texte(self, texte: str | None, parent: str) -> None:
        if parent not in AVEC_TEXTE and texte and texte.strip():
            self.erreurs.append(f"Texte hors d'un élément <text> : « {texte.strip()[:40]} ».")

    def element(self, element: ElementTree.Element, parent: str | None) -> None:
        nom, espace = _nom(element.tag)
        if espace not in (None, NS_SVG):
            self.erreurs.append(f"Élément <{nom}> d'un espace de noms non autorisé.")
            return
        if nom not in ELEMENTS:
            self.erreurs.append(f"Élément <{nom}> non autorisé.")
            return
        self.elements += 1
        if nom == "svg" and parent is not None:
            self.erreurs.append("Un <svg> ne peut pas contenir un autre <svg>.")
            return
        if nom in ("title", "desc"):
            if parent != "svg":
                self.erreurs.append("<title> et <desc> se placent directement dans <svg>.")
            if nom == "title":
                self.titres += 1
            else:
                self.descriptions += 1

        for cle, valeur in element.attrib.items():
            attribut, espace_attribut = _nom(cle)
            if espace_attribut is not None:
                self.erreurs.append(
                    f"Attribut « {attribut} » avec un préfixe non autorisé sur <{nom}>."
                )
            elif attribut not in REGLES["attributs"]:
                self.erreurs.append(f"Attribut « {attribut} » non autorisé sur <{nom}>.")
            elif erreur := _erreur_de_valeur(attribut, valeur):
                self.erreurs.append(erreur)

        self.texte(element.text, nom)
        for enfant in element:
            self.element(enfant, nom)
            self.texte(enfant.tail, nom)


def erreurs_svg(svg: str, *, complet: bool = True) -> list[str]:
    """Les écarts du SVG à la liste blanche. Vide si l'illustration est acceptée.

    `complet` : le SVG porte son <title> et son <desc>, comme dans le Markdown de la leçon.
    Sinon, c'est le SVG d'un paquet : ils viennent des champs `alt` et `description`.
    """
    if len(svg) > REGLES["taille_max"]:
        return [f"L'illustration dépasse {REGLES['taille_max']} caractères."]
    if DOCTYPE.search(svg):
        return ["Pas de DOCTYPE ni d'entité dans une illustration."]
    try:
        # Sans DOCTYPE, aucune entité ne peut être déclarée : rien à développer (XXE, « billion
        # laughs »). Les commentaires et instructions de traitement sont ignorés par le parseur.
        racine = ElementTree.fromstring(svg)  # noqa: S314
    except ElementTree.ParseError as erreur:
        return [f"SVG illisible : {erreur}."]

    nom, espace = _nom(racine.tag)
    if espace not in (None, NS_SVG):
        return [f"Élément <{nom}> d'un espace de noms non autorisé."]
    if nom != "svg":
        return ["L'illustration doit commencer par <svg>."]
    controle = _Controle()
    controle.element(racine, None)
    if "viewBox" not in racine.attrib:
        controle.erreurs.append("<svg> doit avoir un attribut viewBox.")
    if controle.elements > REGLES["elements_max"]:
        controle.erreurs.append(f"Plus de {REGLES['elements_max']} éléments.")
    if complet:
        if controle.titres > 1 or controle.descriptions > 1:
            controle.erreurs.append("Un seul <title> et un seul <desc>.")
        if controle.titres == 0:
            controle.erreurs.append("Il manque le <title> (texte alternatif).")
        if controle.descriptions == 0:
            controle.erreurs.append("Il manque le <desc> (description).")
    elif controle.titres or controle.descriptions:
        controle.erreurs.append(
            "Pas de <title> ni de <desc> dans le SVG : "
            "ils viennent des champs « alt » et « description »."
        )
    return controle.erreurs


def svg_complet(svg: str, alt: str, description: str) -> str:
    """Ajoute le <title> et le <desc> au début du SVG d'un paquet, déjà contrôlé."""
    ajout = (
        f"<title>{html.escape(alt, quote=False)}</title>"
        f"<desc>{html.escape(description, quote=False)}</desc>"
    )
    ouverture = OUVERTURE_SVG.search(svg)
    if ouverture is None:
        raise ValueError("Le SVG n'a pas de balise <svg>.")
    balise = ouverture.group(0)
    if balise.endswith("/>"):
        remplacement = f"{balise[:-2].rstrip()}>{ajout}</svg>"
    else:
        remplacement = balise + ajout
    return svg[: ouverture.start()] + remplacement + svg[ouverture.end() :]
