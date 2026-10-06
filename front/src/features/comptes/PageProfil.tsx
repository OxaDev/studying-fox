import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Form } from "react-aria-components";
import { useNavigate } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { Bouton } from "../../composants/Bouton";
import boutons from "../../composants/Bouton.module.css";
import { ChampTexte } from "../../composants/ChampTexte";
import { ChoixTheme } from "../../composants/ChoixTheme";
import { classes } from "../../composants/classes";
import dialogue from "../../composants/Confirmation.module.css";
import { Fenetre } from "../../composants/Fenetre";
import formulaire from "../../composants/Formulaire.module.css";
import { lireFormulaire, validerMotDePasse, validerPseudo } from "../../composants/formulaire";
import { ADRESSE_EXPORT, comptesApi } from "./api";
import styles from "./PageProfil.module.css";
import { CLE_MOI, useMoiConnecte, useSession, useVerificationEmail } from "./session";

export function PageProfil() {
  return (
    <>
      <title>Mon profil — Le Renard Étudiant</title>
      <h1>Mon profil</h1>
      <div className={styles.sections}>
        <SectionAffichage />
        <SectionPseudo />
        <SectionEmail />
        <SectionMotDePasse />
        <SectionDonnees />
        <SectionSuppression />
      </div>
    </>
  );
}

function SectionAffichage() {
  return (
    <section aria-labelledby="titre-affichage" className={styles.section}>
      <h2 id="titre-affichage">Affichage</h2>
      <ChoixTheme />
    </section>
  );
}

function SectionPseudo() {
  const moi = useMoiConnecte();
  const session = useSession();
  const modification = useMutation({
    mutationFn: comptesApi.modifierProfil,
    onSuccess: (miseAJour) => {
      session.ouvrir(miseAJour);
    },
  });

  return (
    <section aria-labelledby="titre-pseudo" className={styles.section}>
      <h2 id="titre-pseudo">Mon pseudo</h2>
      {modification.isSuccess && <Alerte type="succes">Pseudo enregistré.</Alerte>}
      {modification.error && <Alerte>{modification.error.message}</Alerte>}
      <Form
        className={formulaire.formulaire}
        validationErrors={modification.error?.champs}
        onSubmit={(evenement) => {
          const { pseudo = "" } = lireFormulaire(evenement);
          modification.mutate({ pseudo: pseudo.trim() });
        }}
      >
        <ChampTexte
          name="pseudo"
          label="Pseudo"
          defaultValue={moi.pseudo}
          autoComplete="username"
          validate={validerPseudo}
          isRequired
        />
        <div className={formulaire.actions}>
          <Bouton type="submit" isPending={modification.isPending}>
            Enregistrer le pseudo
          </Bouton>
        </div>
      </Form>
    </section>
  );
}

function SectionEmail() {
  const moi = useMoiConnecte();
  const queryClient = useQueryClient();
  const verification = useVerificationEmail();
  const changement = useMutation({
    mutationFn: comptesApi.changerEmail,
    // Sans vérification (ADR 0023), l'adresse a déjà changé : on recharge le compte.
    onSuccess: () =>
      verification ? undefined : queryClient.invalidateQueries({ queryKey: CLE_MOI }),
  });

  return (
    <section aria-labelledby="titre-email" className={styles.section}>
      <h2 id="titre-email">Mon adresse email</h2>
      <p>
        Adresse actuelle : <strong>{moi.email}</strong>
      </p>
      {changement.isSuccess &&
        (verification ? (
          <Alerte type="succes">
            Un lien de confirmation vient de partir vers {changement.variables.nouvel_email}. Ton
            adresse changera quand tu l&apos;auras ouvert.
          </Alerte>
        ) : (
          <Alerte type="succes">Adresse email changée.</Alerte>
        ))}
      {changement.error && <Alerte>{changement.error.message}</Alerte>}
      <Form
        className={formulaire.formulaire}
        validationErrors={changement.error?.champs}
        onSubmit={(evenement) => {
          const { nouvel_email = "", mot_de_passe = "" } = lireFormulaire(evenement);
          changement.mutate({ nouvel_email, mot_de_passe });
        }}
      >
        <ChampTexte
          name="nouvel_email"
          type="email"
          label="Nouvelle adresse email"
          autoComplete="email"
          isRequired
        />
        <ChampTexte
          name="mot_de_passe"
          type="password"
          label="Mot de passe actuel"
          aide="Pour vérifier que c'est bien toi."
          autoComplete="current-password"
          isRequired
        />
        <div className={formulaire.actions}>
          <Bouton type="submit" isPending={changement.isPending}>
            Changer d&apos;adresse
          </Bouton>
        </div>
      </Form>
    </section>
  );
}

function SectionMotDePasse() {
  const formulaireRef = useRef<HTMLFormElement>(null);
  const changement = useMutation({
    mutationFn: comptesApi.changerMotDePasse,
    onSuccess: () => formulaireRef.current?.reset(),
  });

  return (
    <section aria-labelledby="titre-mdp" className={styles.section}>
      <h2 id="titre-mdp">Mon mot de passe</h2>
      {changement.isSuccess && (
        <Alerte type="succes">
          Mot de passe changé. Tes autres appareils ont été déconnectés.
        </Alerte>
      )}
      {changement.error && <Alerte>{changement.error.message}</Alerte>}
      <Form
        ref={formulaireRef}
        className={formulaire.formulaire}
        validationErrors={changement.error?.champs}
        onSubmit={(evenement) => {
          const { actuel = "", nouveau = "" } = lireFormulaire(evenement);
          changement.mutate({ actuel, nouveau });
        }}
      >
        <ChampTexte
          name="actuel"
          type="password"
          label="Mot de passe actuel"
          autoComplete="current-password"
          isRequired
        />
        <ChampTexte
          name="nouveau"
          type="password"
          label="Nouveau mot de passe"
          aide="12 caractères minimum."
          autoComplete="new-password"
          validate={validerMotDePasse}
          isRequired
        />
        <div className={formulaire.actions}>
          <Bouton type="submit" isPending={changement.isPending}>
            Changer de mot de passe
          </Bouton>
        </div>
      </Form>
    </section>
  );
}

function SectionDonnees() {
  return (
    <section aria-labelledby="titre-donnees" className={styles.section}>
      <h2 id="titre-donnees">Mes données</h2>
      <p>
        Récupère tout ce que le site garde sur toi : ton compte, ta progression, tes contributions
        et tes relectures. Le fichier est au format JSON.
      </p>
      <a
        href={ADRESSE_EXPORT}
        download
        className={classes(boutons.bouton, boutons.lien, boutons.secondaire)}
      >
        Télécharger mes données
      </a>
    </section>
  );
}

function SectionSuppression() {
  const session = useSession();
  const navigate = useNavigate();
  const suppression = useMutation({
    mutationFn: comptesApi.supprimerCompte,
    onSuccess: async () => {
      // On quitte d'abord les pages connectées : sinon elles renverraient vers la connexion
      // sans le message de confirmation.
      await navigate("/connexion?compte=supprime", { replace: true });
      session.fermer();
    },
  });

  return (
    <section aria-labelledby="titre-suppression" className={styles.section}>
      <h2 id="titre-suppression">Supprimer mon compte</h2>
      <p>
        La suppression est définitive. Ta progression et tes brouillons sont effacés. Les leçons
        déjà publiées restent en ligne, signées « Contributeur anonyme ».
      </p>
      <Fenetre declencheur="Supprimer mon compte" titre="Supprimer ton compte ?">
        {(fermer) => (
          <Form
            className={formulaire.formulaire}
            onSubmit={(evenement) => {
              const { mot_de_passe = "" } = lireFormulaire(evenement);
              suppression.mutate({ mot_de_passe });
            }}
          >
            <p>Cette action est définitive. Pense à télécharger tes données avant.</p>
            {suppression.error && <Alerte>{suppression.error.message}</Alerte>}
            <ChampTexte
              name="mot_de_passe"
              type="password"
              label="Mot de passe"
              aide="Pour vérifier que c'est bien toi."
              autoComplete="current-password"
              isRequired
            />
            <div className={dialogue.actions}>
              <Bouton variante="secondaire" onPress={fermer}>
                Annuler
              </Bouton>
              <Bouton type="submit" isPending={suppression.isPending}>
                Supprimer définitivement
              </Bouton>
            </div>
          </Form>
        )}
      </Fenetre>
    </section>
  );
}
