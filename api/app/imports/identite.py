"""Identité des leçons et des parcours d'un paquet (ADR 0025).

À partir de la version 3 du format, chaque leçon et le parcours portent un UUID, qui devient
leur identifiant en base. On les retrouve par cet identifiant, et non plus par leur slug :
un même fichier peut être chargé plusieurs fois sans créer de doublon.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.imports.format import BlocIllustration, LeconImportee, Paquet, ParcoursImporte
from app.imports.lecture import Erreur
from app.lecons.modeles import Lecon
from app.parcours.modeles import Parcours


def erreurs_de_format(paquet: Paquet) -> list[Erreur]:
    """Identifiants obligatoires en version 3, inconnus avant, et uniques dans le paquet.

    Le bloc « illustration » demande la version 4 (ADR 0029).
    """
    erreurs: list[Erreur] = []
    if paquet.version < 4:
        for lecon in paquet.lecons:
            for index, bloc in enumerate(lecon.blocs, start=1):
                if isinstance(bloc, BlocIllustration):
                    erreurs.append(
                        Erreur(
                            f"Leçon « {lecon.slug} » › bloc {index}",
                            "Le bloc « illustration » demande la version 4 du format.",
                        )
                    )
    vus: set[uuid.UUID] = set()
    elements: list[tuple[str, uuid.UUID | None]] = [
        (f"Leçon « {lecon.slug} »", lecon.id) for lecon in paquet.lecons
    ]
    if paquet.parcours:
        elements.append((f"Parcours « {paquet.parcours.slug} »", paquet.parcours.id))
    for ici, identifiant in elements:
        if identifiant is None:
            if paquet.version >= 3:
                erreurs.append(
                    Erreur(f"{ici} › id", "Champ obligatoire à partir de la version 3 du format.")
                )
            continue
        if paquet.version < 3:
            erreurs.append(Erreur(f"{ici} › id", "L'identifiant demande la version 3 du format."))
        if identifiant in vus:
            erreurs.append(Erreur(f"{ici} › id", "Cet identifiant apparaît deux fois."))
        vus.add(identifiant)
    return erreurs


async def trouver_lecon(db: AsyncSession, importee: LeconImportee) -> Lecon | None:
    if importee.id:
        return await db.get(Lecon, importee.id)
    return await db.scalar(select(Lecon).where(Lecon.slug == importee.slug))


async def trouver_parcours(db: AsyncSession, importe: ParcoursImporte) -> Parcours | None:
    if importe.id:
        return await db.get(Parcours, importe.id)
    return await db.scalar(select(Parcours).where(Parcours.slug == importe.slug))


async def erreurs_d_identite(db: AsyncSession, paquet: Paquet) -> list[Erreur]:
    """Un identifiant connu garde son slug, et un slug déjà pris l'est par le même identifiant."""
    erreurs: list[Erreur] = []
    for lecon in paquet.lecons:
        if lecon.id is None:
            continue
        ici = f"Leçon « {lecon.slug} »"
        par_id = await db.get(Lecon, lecon.id)
        if par_id and par_id.slug != lecon.slug:
            erreurs.append(
                Erreur(
                    ici, f"Cette leçon existe sous le slug « {par_id.slug} » : il ne change pas."
                )
            )
        par_slug = await db.scalar(select(Lecon.id).where(Lecon.slug == lecon.slug))
        if par_slug and par_slug != lecon.id:
            erreurs.append(Erreur(ici, "Ce slug est déjà pris par une autre leçon du site."))

    parcours = paquet.parcours
    if parcours and parcours.id:
        ici = f"Parcours « {parcours.slug} »"
        existant = await db.get(Parcours, parcours.id)
        if existant and existant.slug != parcours.slug:
            erreurs.append(
                Erreur(
                    ici, f"Ce parcours existe sous le slug « {existant.slug} » : il ne change pas."
                )
            )
        par_slug = await db.scalar(select(Parcours.id).where(Parcours.slug == parcours.slug))
        if par_slug and par_slug != parcours.id:
            erreurs.append(Erreur(ici, "Ce slug est déjà pris par un autre parcours du site."))
    return erreurs
