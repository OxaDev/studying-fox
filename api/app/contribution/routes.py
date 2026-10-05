"""Leçons écrites sur le site par les contributeurs (cadrage § 5.5, ADR 0010 et 0022)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.journal import journaliser
from app.comptes.dependances import Connecte, Db, Ecriture, Lecture, exiger_role
from app.comptes.modeles import Role, Utilisateur
from app.contribution.schemas import (
    DUREE_MIN,
    RESUME_MIN,
    TITRE_MIN,
    ContenuBrouillon,
    Contribution,
    ElementContribution,
    NouvelleLecon,
    Retour,
    Soumission,
)
from app.lecons.modeles import Lecon, Revision, StatutRevision, Theme
from app.lecons.routes import AUTEUR_ANONYME
from app.lecons.schemas import ThemeLecture
from app.relecture.modeles import Relecture
from app.temps import maintenant

router = APIRouter(
    prefix="/contributions",
    tags=["contributions"],
    dependencies=[Depends(exiger_role(Role.CONTRIBUTEUR))],
)

# Une proposition « ouverte » n'est ni publiée ni refusée.
OUVERTES = (StatutRevision.BROUILLON, StatutRevision.EN_RELECTURE, StatutRevision.A_CORRIGER)


async def _theme(db: AsyncSession, slug: str) -> Theme:
    theme = await db.scalar(select(Theme).where(Theme.slug == slug))
    if theme is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Thème inconnu.")
    return theme


async def _ma_revision(db: AsyncSession, revision_id: uuid.UUID, connecte: Connecte) -> Revision:
    """La révision, si elle appartient à l'utilisateur. Sinon : introuvable, sans dire pourquoi."""
    revision = await db.get(Revision, revision_id)
    if revision is None or revision.auteur_id != connecte.utilisateur.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contribution introuvable.")
    return revision


async def _detail(db: AsyncSession, revision: Revision) -> Contribution:
    # modifiee_le est recalculée par la base à chaque mise à jour : on la relit.
    await db.refresh(revision, ["modifiee_le"])
    lecon = await db.get(Lecon, revision.lecon_id)
    if lecon is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leçon introuvable.")
    lignes = await db.execute(
        select(Relecture, Utilisateur.pseudo)
        .outerjoin(Utilisateur, Utilisateur.id == Relecture.relecteur_id)
        .where(Relecture.revision_id == revision.id)
        .order_by(Relecture.cree_le)
    )
    return Contribution(
        revision_id=revision.id,
        lecon_slug=lecon.slug,
        numero=revision.numero,
        statut=revision.statut,
        titre=revision.titre,
        resume=revision.resume,
        objectifs=revision.objectifs,
        duree_minutes=revision.duree_minutes,
        contenu=revision.contenu,
        theme=ThemeLecture(slug=lecon.theme.slug, nom=lecon.theme.nom),
        niveau=lecon.niveau,
        nouvelle_lecon=lecon.revision_publiee_id is None,
        modifiee_le=revision.modifiee_le,
        retours=[
            Retour(
                decision=relecture.decision,
                relecteur=pseudo or AUTEUR_ANONYME,
                commentaire=relecture.commentaire,
                cree_le=relecture.cree_le,
            )
            for relecture, pseudo in lignes
        ],
    )


async def _numero_suivant(db: AsyncSession, lecon_id: uuid.UUID) -> int:
    dernier = await db.scalar(
        select(func.coalesce(func.max(Revision.numero), 0)).where(Revision.lecon_id == lecon_id)
    )
    return (dernier or 0) + 1


def _copie(source: Revision, numero: int, auteur_id: uuid.UUID) -> Revision:
    return Revision(
        lecon_id=source.lecon_id,
        numero=numero,
        titre=source.titre,
        resume=source.resume,
        objectifs=list(source.objectifs),
        duree_minutes=source.duree_minutes,
        contenu=source.contenu,
        statut=StatutRevision.BROUILLON,
        auteur_id=auteur_id,
    )


def _exiger_brouillon(revision: Revision) -> None:
    if revision.statut is not StatutRevision.BROUILLON:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cette version n'est plus un brouillon : elle ne peut plus être modifiée.",
        )


# --- Lecture -----------------------------------------------------------------------------


@router.get("")
async def mes_contributions(connecte: Lecture, db: Db) -> list[ElementContribution]:
    lignes = await db.execute(
        select(Revision, Lecon)
        .join(Lecon, Lecon.id == Revision.lecon_id)
        .where(Revision.auteur_id == connecte.utilisateur.id, Revision.import_id.is_(None))
        .order_by(Revision.modifiee_le.desc())
    )
    return [
        ElementContribution(
            revision_id=revision.id,
            lecon_slug=lecon.slug,
            titre=revision.titre,
            numero=revision.numero,
            statut=revision.statut,
            nouvelle_lecon=lecon.revision_publiee_id is None,
            modifiee_le=revision.modifiee_le,
        )
        for revision, lecon in lignes
    ]


@router.get("/{revision_id}")
async def lire_contribution(revision_id: uuid.UUID, connecte: Lecture, db: Db) -> Contribution:
    return await _detail(db, await _ma_revision(db, revision_id, connecte))


# --- Création ----------------------------------------------------------------------------


@router.post("", status_code=status.HTTP_201_CREATED)
async def nouvelle_lecon(donnees: NouvelleLecon, connecte: Ecriture, db: Db) -> Contribution:
    if await db.scalar(select(Lecon.id).where(Lecon.slug == donnees.slug)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Une leçon utilise déjà cet identifiant.")
    theme = await _theme(db, donnees.theme)
    lecon = Lecon(slug=donnees.slug, theme_id=theme.id, niveau=donnees.niveau)
    db.add(lecon)
    await db.flush()
    revision = Revision(
        lecon_id=lecon.id,
        numero=1,
        titre=donnees.titre,
        resume="",
        objectifs=[],
        duree_minutes=10,
        contenu="",
        statut=StatutRevision.BROUILLON,
        auteur_id=connecte.utilisateur.id,
    )
    db.add(revision)
    await db.commit()
    return await _detail(db, revision)


@router.post("/depuis/{slug}")
async def proposer_modification(slug: str, connecte: Ecriture, db: Db) -> Contribution:
    """Brouillon copié de la version en ligne, ou la proposition déjà ouverte s'il y en a une."""
    lecon = await db.scalar(select(Lecon).where(Lecon.slug == slug))
    if lecon is None or lecon.revision_publiee is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leçon introuvable.")
    ouverte = await db.scalar(
        select(Revision)
        .where(
            Revision.lecon_id == lecon.id,
            Revision.auteur_id == connecte.utilisateur.id,
            Revision.statut.in_(OUVERTES),
        )
        .order_by(Revision.numero.desc())
        .limit(1)
    )
    if ouverte:
        return await _detail(db, ouverte)
    revision = _copie(
        lecon.revision_publiee, await _numero_suivant(db, lecon.id), connecte.utilisateur.id
    )
    db.add(revision)
    await db.commit()
    return await _detail(db, revision)


@router.post("/{revision_id}/reprendre", status_code=status.HTTP_201_CREATED)
async def reprendre(revision_id: uuid.UUID, connecte: Ecriture, db: Db) -> Contribution:
    """Après « demander des corrections » : nouveau brouillon copié de la version relue."""
    source = await _ma_revision(db, revision_id, connecte)
    if source.statut is not StatutRevision.A_CORRIGER:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Seule une version à corriger peut être reprise."
        )
    # Déjà reprise : on renvoie le brouillon existant plutôt que d'en créer un second.
    deja = await db.scalar(
        select(Revision).where(
            Revision.lecon_id == source.lecon_id,
            Revision.auteur_id == connecte.utilisateur.id,
            Revision.numero > source.numero,
        )
    )
    if deja:
        return await _detail(db, deja)
    revision = _copie(source, await _numero_suivant(db, source.lecon_id), connecte.utilisateur.id)
    db.add(revision)
    await db.commit()
    return await _detail(db, revision)


# --- Modification ------------------------------------------------------------------------


@router.put("/{revision_id}")
async def enregistrer(
    revision_id: uuid.UUID, donnees: ContenuBrouillon, connecte: Ecriture, db: Db
) -> Contribution:
    revision = await _ma_revision(db, revision_id, connecte)
    _exiger_brouillon(revision)
    revision.titre = donnees.titre
    revision.resume = donnees.resume
    revision.objectifs = [o.strip() for o in donnees.objectifs if o.strip()]
    revision.duree_minutes = donnees.duree_minutes
    revision.contenu = donnees.contenu
    lecon = await db.get(Lecon, revision.lecon_id)
    if lecon and lecon.revision_publiee_id is None:
        if donnees.theme:
            lecon.theme_id = (await _theme(db, donnees.theme)).id
        if donnees.niveau:
            lecon.niveau = donnees.niveau
    await db.commit()
    if lecon:
        await db.refresh(lecon)  # le thème a pu changer
    return await _detail(db, revision)


def _champs_manquants(revision: Revision) -> dict[str, str]:
    """Ce qu'il manque pour soumettre. Les clés sont les noms des champs du formulaire."""
    manquants: dict[str, str] = {}
    if len(revision.titre.strip()) < TITRE_MIN:
        manquants["titre"] = f"Le titre doit faire au moins {TITRE_MIN} caractères."
    if len(revision.resume.strip()) < RESUME_MIN:
        manquants["resume"] = f"Le résumé doit faire au moins {RESUME_MIN} caractères."
    if not revision.objectifs:
        manquants["objectifs"] = "Indique au moins un objectif."
    if revision.duree_minutes < DUREE_MIN:
        manquants["duree_minutes"] = f"La durée doit être d'au moins {DUREE_MIN} minutes."
    if not revision.contenu.strip():
        manquants["contenu"] = "La leçon n'a pas encore de contenu."
    return manquants


@router.post("/{revision_id}/soumettre")
async def soumettre(
    revision_id: uuid.UUID, donnees: Soumission, connecte: Ecriture, db: Db
) -> Contribution:
    revision = await _ma_revision(db, revision_id, connecte)
    _exiger_brouillon(revision)
    utilisateur = connecte.utilisateur
    if utilisateur.licence_acceptee_le is None:
        if not donnees.accepte_licence:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "Pour soumettre, accepte la publication sous licence CC BY-SA 4.0.",
            )
        utilisateur.licence_acceptee_le = maintenant()
    manquants = _champs_manquants(revision)
    if manquants:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            [
                {"loc": ["body", champ], "msg": message, "type": "champ_incomplet"}
                for champ, message in manquants.items()
            ],
        )
    revision.statut = StatutRevision.EN_RELECTURE
    journaliser(
        db, utilisateur.id, "soumission", f"revision:{revision.id}", version=str(revision.numero)
    )
    await db.commit()
    return await _detail(db, revision)


@router.delete("/{revision_id}", status_code=status.HTTP_204_NO_CONTENT)
async def supprimer(revision_id: uuid.UUID, connecte: Ecriture, db: Db) -> None:
    """Supprime un brouillon jamais soumis. Une leçon qui n'a plus aucune version disparaît."""
    revision = await _ma_revision(db, revision_id, connecte)
    _exiger_brouillon(revision)
    lecon_id = revision.lecon_id
    await db.delete(revision)
    await db.flush()
    if not await db.scalar(select(Revision.id).where(Revision.lecon_id == lecon_id).limit(1)):
        await db.execute(delete(Lecon).where(Lecon.id == lecon_id))
    await db.commit()
