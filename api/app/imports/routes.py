"""Import de paquets de leçons, réservé aux relecteurs et aux admins (ADR 0019)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select

from app.comptes.dependances import Db, Ecriture, exiger_role
from app.comptes.modeles import Role
from app.imports.lecture import TAILLE_MAX_FICHIER, Erreur
from app.imports.service import (
    Analyse,
    ApercuLecon,
    ApercuParcours,
    CodeAVerifier,
    analyser,
    importer,
)
from app.lecons.modeles import Lecon, Revision

router = APIRouter(
    prefix="/imports", tags=["imports"], dependencies=[Depends(exiger_role(Role.RELECTEUR))]
)


class ResultatAnalyse(BaseModel):
    valide: bool
    erreurs: list[Erreur]
    lecons: list[ApercuLecon]
    parcours: ApercuParcours | None
    codes: list[CodeAVerifier]
    assiste_par_ia: bool
    outil: str | None


class RevisionCreee(BaseModel):
    slug: str
    revision_id: uuid.UUID


class ResultatImport(BaseModel):
    id: uuid.UUID
    revisions: list[RevisionCreee]


async def _lire(fichier: UploadFile) -> bytes:
    contenu = await fichier.read(TAILLE_MAX_FICHIER + 1)
    if len(contenu) > TAILLE_MAX_FICHIER:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE, "Fichier trop lourd (20 Mo maximum)."
        )
    return contenu


def _resultat(analyse: Analyse) -> ResultatAnalyse:
    generation = analyse.fichier.paquet.generation if analyse.fichier.paquet else None
    return ResultatAnalyse(
        valide=analyse.valide,
        erreurs=analyse.erreurs,
        lecons=analyse.lecons,
        parcours=analyse.parcours,
        codes=analyse.codes,
        assiste_par_ia=generation.assiste_par_ia if generation else False,
        outil=generation.outil if generation else None,
    )


@router.post("/analyse")
async def analyser_fichier(fichier: UploadFile, _: Ecriture, db: Db) -> ResultatAnalyse:
    """Vérifie le fichier sans rien enregistrer. Le navigateur exécute ensuite les codes listés."""
    return _resultat(await analyser(db, fichier.filename or "", await _lire(fichier)))


@router.post("", status_code=status.HTTP_201_CREATED)
async def importer_fichier(fichier: UploadFile, connecte: Ecriture, db: Db) -> ResultatImport:
    """Crée une révision « brouillon » par leçon. Le fichier est réanalysé : tout ou rien."""
    nom = fichier.filename or "paquet.json"
    analyse = await analyser(db, nom, await _lire(fichier))
    if not analyse.valide:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Le fichier contient des erreurs. Relance l'analyse pour les voir.",
        )
    envoi = await importer(db, analyse, nom, connecte.utilisateur)
    revisions = await db.execute(
        select(Lecon.slug, Revision.id)
        .join(Revision, Revision.lecon_id == Lecon.id)
        .where(Revision.import_id == envoi.id)
    )
    await db.commit()
    return ResultatImport(
        id=envoi.id,
        revisions=[RevisionCreee(slug=slug, revision_id=rid) for slug, rid in revisions],
    )
