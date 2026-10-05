"""Administration des thèmes (cadrage § 5.8). Le slug sert dans les adresses : il ne change pas."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, StringConstraints
from sqlalchemy import func, select

from app.admin.journal import journaliser
from app.comptes.dependances import Db, Ecriture, exiger_role
from app.comptes.modeles import Role
from app.lecons.modeles import Lecon, Theme
from app.parcours.modeles import Parcours

router = APIRouter(
    prefix="/admin/themes", tags=["admin"], dependencies=[Depends(exiger_role(Role.ADMIN))]
)

Nom = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]
SlugTheme = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", max_length=80)]


class ThemeAdmin(BaseModel):
    slug: str
    nom: str
    nb_lecons: int
    nb_parcours: int


class NouveauTheme(BaseModel):
    slug: SlugTheme
    nom: Nom


class ModificationTheme(BaseModel):
    nom: Nom


async def _compter(db: Db, theme: Theme) -> ThemeAdmin:
    nb_lecons = await db.scalar(select(func.count()).where(Lecon.theme_id == theme.id))
    nb_parcours = await db.scalar(select(func.count()).where(Parcours.theme_id == theme.id))
    return ThemeAdmin(
        slug=theme.slug, nom=theme.nom, nb_lecons=nb_lecons or 0, nb_parcours=nb_parcours or 0
    )


async def _theme(db: Db, slug: str) -> Theme:
    theme = await db.scalar(select(Theme).where(Theme.slug == slug))
    if theme is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Thème introuvable.")
    return theme


@router.get("")
async def lister_themes(db: Db) -> list[ThemeAdmin]:
    return [
        await _compter(db, theme) for theme in await db.scalars(select(Theme).order_by(Theme.nom))
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def creer_theme(donnees: NouveauTheme, connecte: Ecriture, db: Db) -> ThemeAdmin:
    if await db.scalar(select(Theme.id).where(Theme.slug == donnees.slug)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Un thème utilise déjà cet identifiant.")
    theme = Theme(slug=donnees.slug, nom=donnees.nom)
    db.add(theme)
    journaliser(db, connecte.utilisateur.id, "theme_creation", f"theme:{theme.slug}", nom=theme.nom)
    await db.commit()
    return await _compter(db, theme)


@router.patch("/{slug}")
async def renommer_theme(
    slug: str, donnees: ModificationTheme, connecte: Ecriture, db: Db
) -> ThemeAdmin:
    theme = await _theme(db, slug)
    if donnees.nom != theme.nom:
        journaliser(
            db,
            connecte.utilisateur.id,
            "theme_modification",
            f"theme:{slug}",
            avant=theme.nom,
            apres=donnees.nom,
        )
        theme.nom = donnees.nom
        await db.commit()
    return await _compter(db, theme)


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def supprimer_theme(slug: str, connecte: Ecriture, db: Db) -> None:
    theme = await _theme(db, slug)
    utilisation = await _compter(db, theme)
    if utilisation.nb_lecons or utilisation.nb_parcours:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Ce thème est utilisé par des leçons ou des parcours : il ne peut pas être supprimé.",
        )
    journaliser(db, connecte.utilisateur.id, "theme_suppression", f"theme:{slug}", nom=theme.nom)
    await db.delete(theme)
    await db.commit()
