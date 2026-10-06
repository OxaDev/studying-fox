"""Parcours validés, chargés au démarrage depuis api/validated_courses/ (ADR 0025)."""

import json
import logging
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import cast

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.config import get_config
from app.db import SessionLocale
from app.imports.parcours_valides import (
    Bilan,
    charger_parcours_valides,
    lire_dossier,
    lire_parcours_valide,
)
from app.lecons.modeles import Lecon, Revision, StatutRevision, Theme
from app.parcours.modeles import Parcours
from tests.outils import creer_lecon

EXEMPLE = Path(__file__).parents[2] / "docs" / "format-lecon" / "exemple.json"

type Paquet = dict[str, object]


def exemple() -> Paquet:
    return cast(Paquet, json.loads(EXEMPLE.read_text(encoding="utf-8")))


def lecons(paquet: Paquet) -> list[dict[str, object]]:
    return cast(list[dict[str, object]], paquet["lecons"])


def parcours(paquet: Paquet) -> dict[str, object]:
    return cast(dict[str, object], paquet["parcours"])


def ecrire(dossier: Path, nom: str, paquet: Paquet) -> None:
    (dossier / nom).write_text(json.dumps(paquet), encoding="utf-8")


async def charger(dossier: Path) -> Bilan:
    async with SessionLocale() as db:
        return await charger_parcours_valides(db, dossier)


async def test_cree_les_themes_des_langages_s_ils_manquent(
    client: AsyncClient, tmp_path: Path
) -> None:
    await charger(tmp_path)
    await charger(tmp_path)

    async with SessionLocale() as db:
        themes = {theme.slug: theme.nom for theme in await db.scalars(select(Theme))}
    assert themes == {"javascript": "JavaScript", "python": "Python", "vba": "VBA"}


async def test_charge_et_publie_un_parcours(client: AsyncClient, tmp_path: Path) -> None:
    ecrire(tmp_path, "python.json", exemple())

    assert await charger(tmp_path) == Bilan(lecons=2, parcours=1)

    async with SessionLocale() as db:
        toutes = list(await db.scalars(select(Lecon)))
        publie = await db.scalar(select(Parcours))
    assert {lecon.id for lecon in toutes} == {uuid.UUID(str(e["id"])) for e in lecons(exemple())}
    assert all(
        lecon.revision_publiee and lecon.revision_publiee.statut is StatutRevision.PUBLIEE
        for lecon in toutes
    )
    assert publie is not None
    assert (publie.id, publie.publie) == (uuid.UUID(str(parcours(exemple())["id"])), True)
    # La vitrine publique, sans connexion, le montre.
    assert "Premiers pas en Python" in (await client.get("/parcours")).text


async def test_un_second_chargement_ne_cree_pas_de_doublon(tmp_path: Path) -> None:
    ecrire(tmp_path, "python.json", exemple())
    await charger(tmp_path)

    assert await charger(tmp_path) == Bilan()

    async with SessionLocale() as db:
        assert await db.scalar(select(func.count()).select_from(Lecon)) == 2
        assert await db.scalar(select(func.count()).select_from(Revision)) == 2
        assert await db.scalar(select(func.count()).select_from(Parcours)) == 1


async def test_ce_qui_existe_n_est_pas_modifie(tmp_path: Path) -> None:
    ecrire(tmp_path, "python.json", exemple())
    await charger(tmp_path)
    modifie = exemple()
    lecons(modifie)[0]["titre"] = "Titre changé dans le fichier"
    ecrire(tmp_path, "python.json", modifie)

    await charger(tmp_path)

    async with SessionLocale() as db:
        titres = set(await db.scalars(select(Revision.titre)))
    assert "Titre changé dans le fichier" not in titres


async def test_seul_ce_qui_manque_est_cree(tmp_path: Path) -> None:
    identifiant = uuid.UUID(str(lecons(exemple())[0]["id"]))
    await creer_lecon(
        "afficher-du-texte-en-python",
        titre="Déjà là",
        statut=StatutRevision.BROUILLON,
        identifiant=identifiant,
    )
    ecrire(tmp_path, "python.json", exemple())

    assert await charger(tmp_path) == Bilan(lecons=1, parcours=1)

    async with SessionLocale() as db:
        revision = await db.scalar(select(Revision).where(Revision.lecon_id == identifiant))
    assert revision is not None
    assert (revision.titre, revision.statut) == ("Déjà là", StatutRevision.BROUILLON)


async def test_un_theme_absent_est_cree(tmp_path: Path) -> None:
    paquet = exemple()
    parcours(paquet)["theme"] = "algorithmique"
    for lecon in lecons(paquet):
        lecon["theme"] = "algorithmique"
    ecrire(tmp_path, "algo.json", paquet)

    await charger(tmp_path)

    async with SessionLocale() as db:
        theme = await db.scalar(select(Theme).where(Theme.slug == "algorithmique"))
    assert theme is not None
    assert theme.nom == "Algorithmique"


async def test_un_fichier_invalide_est_ignore_et_signale(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    invalide = exemple()
    invalide["version"] = 2
    ecrire(tmp_path, "a-invalide.json", invalide)
    autre = exemple()
    parcours(autre)["id"] = str(uuid.uuid4())
    parcours(autre)["slug"] = "un-autre-parcours"
    ecrire(tmp_path, "b-valide.json", autre)

    with caplog.at_level(logging.ERROR):
        bilan = await charger(tmp_path)

    assert bilan == Bilan(lecons=2, parcours=1)
    assert "a-invalide.json" in caplog.text


async def test_un_conflit_n_enregistre_rien_du_fichier(tmp_path: Path) -> None:
    # Le slug de la seconde leçon est déjà pris par une leçon d'un autre identifiant.
    await creer_lecon("les-variables-en-python")
    ecrire(tmp_path, "python.json", exemple())

    assert await charger(tmp_path) == Bilan()

    async with SessionLocale() as db:
        assert await db.scalar(select(func.count()).select_from(Lecon)) == 1
        assert await db.scalar(select(func.count()).select_from(Parcours)) == 0


@pytest.mark.parametrize(
    ("modifier", "message"),
    [
        (lambda p: p.update(version=2), "Un parcours validé utilise la version 3 du format."),
        (lambda p: p.pop("parcours"), "Un parcours validé contient un parcours."),
        (
            lambda p: lecons(p).pop(),
            "La leçon « les-variables-en-python » doit être dans le fichier.",
        ),
    ],
)
def test_regles_du_dossier(
    tmp_path: Path, modifier: Callable[[Paquet], object], message: str
) -> None:
    paquet = exemple()
    modifier(paquet)
    ecrire(tmp_path, "paquet.json", paquet)

    fichiers = lire_dossier(tmp_path)

    assert len(fichiers) == 1
    assert message in str(fichiers[0][1])


def test_les_parcours_valides_du_depot_sont_corrects() -> None:
    """Chaque fichier du dossier respecte le format et les règles des parcours validés."""
    dossier = get_config().dossier_parcours_valides
    assert dossier.is_dir()
    identifiants: set[str] = set()
    for chemin in sorted(dossier.glob("*.json")):
        paquet = lire_parcours_valide(chemin)
        for element in [*paquet.lecons, paquet.parcours]:
            assert element is not None
            assert str(element.id) not in identifiants, f"{chemin.name} : identifiant réutilisé"
            identifiants.add(str(element.id))
