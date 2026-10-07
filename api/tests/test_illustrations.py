"""Illustrations vectorielles (ADR 0029) : liste blanche, conversion, import et recherche."""

import json
from pathlib import Path
from typing import cast

import pytest
from httpx import AsyncClient
from pydantic import ValidationError

from app.comptes.modeles import Role
from app.emails import ExpediteurMemoire
from app.imports.conversion import bloc_en_markdown
from app.imports.format import BlocIllustration
from app.imports.illustration import COULEURS, erreurs_svg, svg_complet
from app.recherche.schemas import Resultats
from tests.outils import connecter, creer_compte, creer_lecon, creer_themes
from tests.test_imports import analyser, en_json, en_version, exemple, lecon

RACINE = Path(__file__).parents[2]
DOSSIER_FRONT = RACINE / "front" / "src" / "features" / "lecons" / "illustration"
CAS = json.loads((DOSSIER_FRONT / "cas-de-test.json").read_text(encoding="utf-8"))["cas"]

CARRE = '<svg viewBox="0 0 10 10"><rect width="4" height="4" fill="illu-rouge"/></svg>'


def test_la_liste_blanche_est_la_meme_que_celle_du_front() -> None:
    front = DOSSIER_FRONT / "regles.json"
    api = RACINE / "api" / "app" / "imports" / "illustration_regles.json"
    assert api.read_text(encoding="utf-8") == front.read_text(encoding="utf-8"), (
        "Copier front/src/features/lecons/illustration/regles.json "
        "dans api/app/imports/illustration_regles.json"
    )


def test_chaque_couleur_de_la_palette_a_son_jeton() -> None:
    jetons = (RACINE / "front" / "src" / "styles" / "tokens.css").read_text(encoding="utf-8")

    assert [couleur for couleur in COULEURS if f"--{couleur}:" not in jetons] == []


@pytest.mark.parametrize("cas", CAS, ids=[cas["nom"] for cas in CAS])
def test_meme_verdict_que_le_front(cas: dict[str, str | None]) -> None:
    erreurs = erreurs_svg(cast(str, cas["svg"]))

    attendue = cas["erreur"]
    if attendue is None:
        assert erreurs == []
    else:
        assert any(attendue in erreur for erreur in erreurs), erreurs


def test_trop_d_elements() -> None:
    svg = '<svg viewBox="0 0 1 1"><title>T</title><desc>D</desc>' + "<g/>" * 2000 + "</svg>"

    assert erreurs_svg(svg) == ["Plus de 2000 éléments."]


def test_trop_long() -> None:
    svg = '<svg viewBox="0 0 1 1"><title>T</title><desc>' + "a" * 100_000 + "</desc></svg>"

    assert erreurs_svg(svg) == ["L'illustration dépasse 100000 caractères."]


def test_dans_un_paquet_le_titre_vient_des_champs() -> None:
    svg = '<svg viewBox="0 0 1 1"><title>T</title></svg>'

    assert erreurs_svg(svg, complet=False) == [
        "Pas de <title> ni de <desc> dans le SVG : "
        "ils viennent des champs « alt » et « description »."
    ]
    assert erreurs_svg(CARRE, complet=False) == []


def test_svg_complet_ajoute_titre_et_description_echappes() -> None:
    svg = svg_complet(CARRE, "Un carré <rouge>", "Le carré & son ombre.")

    assert svg == (
        '<svg viewBox="0 0 10 10"><title>Un carré &lt;rouge&gt;</title>'
        "<desc>Le carré &amp; son ombre.</desc>"
        '<rect width="4" height="4" fill="illu-rouge"/></svg>'
    )
    assert erreurs_svg(svg) == []


def test_svg_complet_d_un_svg_vide() -> None:
    svg = svg_complet('<svg viewBox="0 0 1 1"/>', "Rien du tout", "Une illustration vide.")

    assert svg == (
        '<svg viewBox="0 0 1 1"><title>Rien du tout</title>'
        "<desc>Une illustration vide.</desc></svg>"
    )


def _bloc(**champs: str) -> BlocIllustration:
    return BlocIllustration.model_validate(
        {
            "type": "illustration",
            "svg": CARRE,
            "alt": "Un carré rouge",
            "description": "Un petit carré rouge dans le coin en haut à gauche.",
            **champs,
        }
    )


def test_conversion_en_markdown() -> None:
    assert bloc_en_markdown(_bloc(legende="Un carré")) == (
        "```illustration Un carré\n"
        '<svg viewBox="0 0 10 10"><title>Un carré rouge</title>'
        "<desc>Un petit carré rouge dans le coin en haut à gauche.</desc>"
        '<rect width="4" height="4" fill="illu-rouge"/></svg>\n'
        "```"
    )
    assert bloc_en_markdown(_bloc()).startswith("```illustration\n<svg")


def test_un_svg_hors_liste_blanche_est_refuse() -> None:
    with pytest.raises(ValidationError, match="Couleur « red » non autorisée"):
        _bloc(svg='<svg viewBox="0 0 1 1"><rect fill="red"/></svg>')


def test_la_legende_tient_sur_une_ligne_sans_accent_grave() -> None:
    with pytest.raises(ValidationError):
        _bloc(legende="Le `code`")
    with pytest.raises(ValidationError):
        _bloc(legende="Deux\nlignes")


# --- Import -------------------------------------------------------------------------------


@pytest.fixture
async def csrf(client: AsyncClient, boite_mail: ExpediteurMemoire) -> dict[str, str]:
    """Une relectrice connectée."""
    await creer_themes()
    compte = await creer_compte(client, boite_mail, pseudo="relectrice", role=Role.RELECTEUR)
    return await connecter(client, compte)


async def test_l_exemple_avec_illustration_est_accepte(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    analyse = (await analyser(client, csrf, en_json(exemple()))).json()

    assert analyse["valide"] is True, analyse["erreurs"]


async def test_une_illustration_demande_la_version_4(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    paquet = en_version(exemple(), 3)
    blocs = cast(list[dict[str, object]], lecon(paquet)["blocs"])
    blocs.append(_bloc().model_dump(exclude_none=True))

    analyse = (await analyser(client, csrf, en_json(paquet))).json()

    assert analyse["erreurs"] == [
        {
            "emplacement": "Leçon « afficher-du-texte-en-python » › bloc 4",
            "message": "Le bloc « illustration » demande la version 4 du format.",
        }
    ]


async def test_l_erreur_d_illustration_indique_le_bloc(
    client: AsyncClient, csrf: dict[str, str]
) -> None:
    paquet = exemple()
    blocs = cast(list[dict[str, object]], lecon(paquet)["blocs"])
    blocs.append(
        {
            "type": "illustration",
            "svg": '<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>',
            "alt": "Une illustration piégée",
            "description": "Elle contient un script, qui doit être refusé.",
        }
    )

    analyse = (await analyser(client, csrf, en_json(paquet))).json()

    assert analyse["erreurs"] == [
        {
            "emplacement": "Leçon « afficher-du-texte-en-python » › bloc 4 › svg",
            "message": "Élément <script> non autorisé.",
        }
    ]


# --- Recherche ----------------------------------------------------------------------------


async def test_la_recherche_lit_le_texte_et_ignore_les_balises(
    client: AsyncClient, boite_mail: ExpediteurMemoire
) -> None:
    contenu = "Le plateau de départ.\n\n" + bloc_en_markdown(
        _bloc(
            svg='<svg viewBox="0 0 10 10"><rect width="4" height="4" fill="illu-rouge"/>'
            '<text x="1" y="8">Échiquier</text></svg>'
        )
    )
    await creer_lecon("les-echecs", titre="Les échecs", contenu=contenu)
    await connecter(client, await creer_compte(client, boite_mail))

    async def chercher(texte: str) -> Resultats:
        reponse = await client.get("/api/recherche", params={"q": texte})
        return Resultats.model_validate(reponse.json())

    trouve = await chercher("échiquier")
    assert [resultat.slug for resultat in trouve.lecons] == ["les-echecs"]
    extrait = "".join(segment.texte for segment in trouve.lecons[0].extrait)
    assert "<" not in extrait
    assert "rect" not in extrait
    assert (await chercher("illu-rouge")).lecons == []
    assert (await chercher("viewBox")).lecons == []
