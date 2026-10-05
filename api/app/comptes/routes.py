"""Routes des comptes : inscription, connexion, profil, mots de passe (cadrage § 5.1)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool

from app import limiteur
from app.comptes import messages
from app.comptes.dependances import COOKIE_SESSION, Db, Ecriture, Lecture
from app.comptes.modeles import SessionUtilisateur, TypeJeton, Utilisateur
from app.comptes.schemas import (
    ChangementEmail,
    ChangementMotDePasse,
    Connexion,
    DemandeParEmail,
    Inscription,
    JetonRecu,
    ModificationProfil,
    Moi,
    Reglages,
    Reinitialisation,
)
from app.comptes.securite import hacher_mot_de_passe, verifier_mot_de_passe
from app.comptes.service import (
    consommer_jeton,
    creer_jeton_email,
    fermer_sessions,
    ouvrir_session,
    pseudo_pris,
    trouver_par_email,
)
from app.config import get_config
from app.emails import Expediteur, get_expediteur
from app.temps import maintenant

router = APIRouter(prefix="/comptes", tags=["comptes"])

Expedition = Annotated[Expediteur, Depends(get_expediteur)]

LIEN_INVALIDE = "Ce lien n'est plus valide. Demande-en un nouveau."
PSEUDO_PRIS = "Ce pseudo est déjà pris."
EMAIL_PRIS = "Cette adresse email est déjà utilisée."
TROP_DE_TENTATIVES = "Trop de tentatives. Réessaie dans quelques minutes."


def _ip(request: Request) -> str:
    return request.client.host if request.client else "inconnue"


def _limiter_envoi(email: str, request: Request) -> None:
    """Évite qu'on se serve de nous pour inonder une boîte mail."""
    ip = _ip(request)
    if limiteur.envois_email.est_bloque(email) or limiteur.envois_email_ip.est_bloque(ip):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, TROP_DE_TENTATIVES)
    limiteur.envois_email.noter(email)
    limiteur.envois_email_ip.noter(ip)


def _moi(utilisateur: Utilisateur, session: SessionUtilisateur) -> Moi:
    return Moi(
        id=utilisateur.id,
        email=utilisateur.email,
        pseudo=utilisateur.pseudo,
        role=utilisateur.role,
        licence_acceptee=utilisateur.licence_acceptee_le is not None,
        jeton_csrf=session.jeton_csrf,
    )


def _poser_cookie(response: Response, jeton: str) -> None:
    config = get_config()
    response.set_cookie(
        COOKIE_SESSION,
        jeton,
        max_age=config.duree_session_jours * 24 * 3600,
        path="/",
        secure=config.cookie_securise,
        httponly=True,
        samesite="lax",
    )


# --- Inscription et confirmation ---------------------------------------------------------


@router.get("/reglages")
async def reglages() -> Reglages:
    return Reglages(verification_email=get_config().verification_email)


@router.post("/inscription", status_code=status.HTTP_204_NO_CONTENT)
async def inscription(
    donnees: Inscription, request: Request, db: Db, expediteur: Expedition
) -> None:
    """Crée un compte et envoie l'email de confirmation.

    Si l'email a déjà un compte, la réponse est la même : on ne révèle pas qui est inscrit.
    Le titulaire de l'adresse reçoit un email qui le lui signale.

    Sans vérification de l'email (ADR 0023), le compte est utilisable tout de suite,
    et une adresse déjà inscrite est signalée : personne d'autre ne pourrait prévenir son titulaire.
    """
    verification = get_config().verification_email
    _limiter_envoi(donnees.email, request)
    if await pseudo_pris(db, donnees.pseudo):
        raise HTTPException(status.HTTP_409_CONFLICT, PSEUDO_PRIS)

    if await trouver_par_email(db, donnees.email) is not None:
        if not verification:
            raise HTTPException(status.HTTP_409_CONFLICT, EMAIL_PRIS)
        await expediteur.envoyer(messages.compte_existant(donnees.email))
        return

    utilisateur = Utilisateur(
        email=donnees.email,
        pseudo=donnees.pseudo,
        mot_de_passe_hash=await run_in_threadpool(hacher_mot_de_passe, donnees.mot_de_passe),
    )
    db.add(utilisateur)
    try:
        await db.flush()
    except IntegrityError as erreur:
        # Deux inscriptions simultanées avec le même pseudo.
        raise HTTPException(status.HTTP_409_CONFLICT, PSEUDO_PRIS) from erreur
    if not verification:
        await db.commit()
        return
    jeton = await creer_jeton_email(db, utilisateur, TypeJeton.CONFIRMATION)
    await db.commit()
    await expediteur.envoyer(messages.confirmation(utilisateur.email, utilisateur.pseudo, jeton))


@router.post("/confirmation", status_code=status.HTTP_204_NO_CONTENT)
async def confirmation(donnees: JetonRecu, db: Db) -> None:
    """Confirme l'adresse d'un nouveau compte, ou la nouvelle adresse d'un compte existant."""
    resultat = await consommer_jeton(
        db, donnees.jeton, {TypeJeton.CONFIRMATION, TypeJeton.CHANGEMENT_EMAIL}
    )
    if resultat is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, LIEN_INVALIDE)
    jeton, utilisateur = resultat

    if jeton.type is TypeJeton.CHANGEMENT_EMAIL and jeton.nouvel_email is not None:
        if await trouver_par_email(db, jeton.nouvel_email) is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, EMAIL_PRIS)
        utilisateur.email = jeton.nouvel_email
    utilisateur.email_verifie_le = maintenant()
    await db.commit()


@router.post("/renvoyer-confirmation", status_code=status.HTTP_204_NO_CONTENT)
async def renvoyer_confirmation(
    donnees: DemandeParEmail, request: Request, db: Db, expediteur: Expedition
) -> None:
    if not get_config().verification_email:
        return
    _limiter_envoi(donnees.email, request)
    utilisateur = await trouver_par_email(db, donnees.email)
    if utilisateur is None or utilisateur.email_verifie_le is not None:
        return
    jeton = await creer_jeton_email(db, utilisateur, TypeJeton.CONFIRMATION)
    await db.commit()
    await expediteur.envoyer(messages.confirmation(utilisateur.email, utilisateur.pseudo, jeton))


# --- Connexion et déconnexion ------------------------------------------------------------


@router.post("/connexion")
async def connexion(donnees: Connexion, request: Request, response: Response, db: Db) -> Moi:
    ip = _ip(request)
    if limiteur.echecs_connexion.est_bloque(
        donnees.email
    ) or limiteur.echecs_connexion_ip.est_bloque(ip):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, TROP_DE_TENTATIVES)

    utilisateur = await trouver_par_email(db, donnees.email)
    hash_enregistre = utilisateur.mot_de_passe_hash if utilisateur else None
    valide = await run_in_threadpool(verifier_mot_de_passe, hash_enregistre, donnees.mot_de_passe)
    if utilisateur is None or not valide:
        limiteur.echecs_connexion.noter(donnees.email)
        limiteur.echecs_connexion_ip.noter(ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email ou mot de passe incorrect.")
    if utilisateur.email_verifie_le is None and get_config().verification_email:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Confirme d'abord ton adresse email : le lien est dans ta boîte de réception.",
        )
    if utilisateur.suspendu:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Ce compte est suspendu.")

    limiteur.echecs_connexion.effacer(donnees.email)
    jeton, session = await ouvrir_session(db, utilisateur)
    await db.commit()
    _poser_cookie(response, jeton)
    return _moi(utilisateur, session)


@router.post("/deconnexion", status_code=status.HTTP_204_NO_CONTENT)
async def deconnexion(connecte: Ecriture, response: Response, db: Db) -> None:
    await db.delete(connecte.session)
    await db.commit()
    response.delete_cookie(
        COOKIE_SESSION,
        path="/",
        secure=get_config().cookie_securise,
        httponly=True,
        samesite="lax",
    )


# --- Profil ------------------------------------------------------------------------------


@router.get("/moi")
async def moi(connecte: Lecture) -> Moi:
    return _moi(connecte.utilisateur, connecte.session)


@router.patch("/moi")
async def modifier_profil(donnees: ModificationProfil, connecte: Ecriture, db: Db) -> Moi:
    utilisateur = connecte.utilisateur
    if await pseudo_pris(db, donnees.pseudo, sauf=utilisateur.id):
        raise HTTPException(status.HTTP_409_CONFLICT, PSEUDO_PRIS)
    utilisateur.pseudo = donnees.pseudo
    await db.commit()
    return _moi(utilisateur, connecte.session)


async def verifier_mot_de_passe_actuel(utilisateur: Utilisateur, mot_de_passe: str) -> None:
    if limiteur.echecs_connexion.est_bloque(utilisateur.email):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, TROP_DE_TENTATIVES)
    if not await run_in_threadpool(
        verifier_mot_de_passe, utilisateur.mot_de_passe_hash, mot_de_passe
    ):
        limiteur.echecs_connexion.noter(utilisateur.email)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mot de passe actuel incorrect.")


@router.post("/moi/mot-de-passe", status_code=status.HTTP_204_NO_CONTENT)
async def changer_mot_de_passe(donnees: ChangementMotDePasse, connecte: Ecriture, db: Db) -> None:
    """Change le mot de passe et déconnecte les autres appareils."""
    utilisateur = connecte.utilisateur
    await verifier_mot_de_passe_actuel(utilisateur, donnees.actuel)
    utilisateur.mot_de_passe_hash = await run_in_threadpool(hacher_mot_de_passe, donnees.nouveau)
    await fermer_sessions(db, utilisateur.id, sauf=connecte.session)
    await db.commit()


@router.post("/moi/email", status_code=status.HTTP_204_NO_CONTENT)
async def changer_email(
    donnees: ChangementEmail, request: Request, connecte: Ecriture, db: Db, expediteur: Expedition
) -> None:
    """Envoie un lien à la nouvelle adresse. Elle ne remplace l'ancienne qu'après confirmation.

    Sans vérification de l'email (ADR 0023), la nouvelle adresse remplace l'ancienne tout de suite.
    """
    utilisateur = connecte.utilisateur
    await verifier_mot_de_passe_actuel(utilisateur, donnees.mot_de_passe)
    if donnees.nouvel_email == utilisateur.email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "C'est déjà ton adresse actuelle.")
    if await trouver_par_email(db, donnees.nouvel_email) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, EMAIL_PRIS)
    if not get_config().verification_email:
        utilisateur.email = donnees.nouvel_email
        utilisateur.email_verifie_le = None
        await db.commit()
        return
    _limiter_envoi(donnees.nouvel_email, request)
    jeton = await creer_jeton_email(
        db, utilisateur, TypeJeton.CHANGEMENT_EMAIL, nouvel_email=donnees.nouvel_email
    )
    await db.commit()
    await expediteur.envoyer(
        messages.changement_email(donnees.nouvel_email, utilisateur.pseudo, jeton)
    )


# --- Mot de passe oublié -----------------------------------------------------------------


@router.post("/mot-de-passe-oublie", status_code=status.HTTP_204_NO_CONTENT)
async def mot_de_passe_oublie(
    donnees: DemandeParEmail, request: Request, db: Db, expediteur: Expedition
) -> None:
    """Envoie un lien de réinitialisation. Même réponse si l'email est inconnu."""
    _limiter_envoi(donnees.email, request)
    utilisateur = await trouver_par_email(db, donnees.email)
    if utilisateur is None:
        return
    jeton = await creer_jeton_email(db, utilisateur, TypeJeton.REINITIALISATION)
    await db.commit()
    await expediteur.envoyer(
        messages.reinitialisation(utilisateur.email, utilisateur.pseudo, jeton)
    )


@router.post("/reinitialisation", status_code=status.HTTP_204_NO_CONTENT)
async def reinitialisation(donnees: Reinitialisation, db: Db) -> None:
    """Change le mot de passe et ferme toutes les sessions."""
    resultat = await consommer_jeton(db, donnees.jeton, {TypeJeton.REINITIALISATION})
    if resultat is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, LIEN_INVALIDE)
    _, utilisateur = resultat
    utilisateur.mot_de_passe_hash = await run_in_threadpool(hacher_mot_de_passe, donnees.nouveau)
    # Le lien est arrivé dans sa boîte : l'adresse est donc confirmée.
    utilisateur.email_verifie_le = utilisateur.email_verifie_le or maintenant()
    limiteur.echecs_connexion.effacer(utilisateur.email)
    await fermer_sessions(db, utilisateur.id)
    await db.commit()
