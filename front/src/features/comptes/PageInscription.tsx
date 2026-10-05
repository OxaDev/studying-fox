import { useMutation } from "@tanstack/react-query";
import { Form } from "react-aria-components";
import { Link, useNavigate } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { Bouton } from "../../composants/Bouton";
import { ChampTexte } from "../../composants/ChampTexte";
import styles from "../../composants/Formulaire.module.css";
import { lireFormulaire, validerMotDePasse, validerPseudo } from "../../composants/formulaire";
import { comptesApi } from "./api";
import { useVerificationEmail } from "./session";

export function PageInscription() {
  const navigate = useNavigate();
  const verification = useVerificationEmail();
  const inscription = useMutation({
    mutationFn: comptesApi.inscription,
    onSuccess: (_, { email }) => {
      // Sans vérification de l'email (ADR 0023), le compte est utilisable tout de suite.
      if (!verification) {
        void navigate(`/connexion?compte=cree&email=${encodeURIComponent(email)}`);
      }
    },
  });

  if (inscription.isSuccess && verification) {
    return (
      <>
        <title>Vérifie tes emails — Le Renard Étudiant</title>
        <h1>Presque fini !</h1>
        <Alerte type="succes">
          <p>
            Un email vient de partir vers <strong>{inscription.variables.email}</strong>.
          </p>
          <p>Ouvre le lien qu&apos;il contient pour activer ton compte.</p>
        </Alerte>
        <p>
          Rien reçu ? Regarde dans tes indésirables, ou{" "}
          <Link to="/confirmation">demande un nouveau lien</Link>.
        </p>
      </>
    );
  }

  return (
    <>
      <title>Créer un compte — Le Renard Étudiant</title>
      <h1>Créer un compte</h1>
      <p>C&apos;est gratuit, et il ne faut qu&apos;une minute.</p>

      {inscription.error && <Alerte>{inscription.error.message}</Alerte>}

      <Form
        className={styles.formulaire}
        validationErrors={inscription.error?.champs}
        onSubmit={(evenement) => {
          const { email = "", pseudo = "", mot_de_passe = "" } = lireFormulaire(evenement);
          inscription.mutate({ email, pseudo: pseudo.trim(), mot_de_passe });
        }}
      >
        <p className={styles.mention}>Tous les champs sont obligatoires.</p>
        <ChampTexte
          name="email"
          type="email"
          label="Adresse email"
          autoComplete="email"
          isRequired
        />
        <ChampTexte
          name="pseudo"
          label="Pseudo"
          aide="Visible par les autres. 3 à 30 caractères : lettres, chiffres, point, tiret, tiret bas."
          autoComplete="username"
          validate={validerPseudo}
          isRequired
        />
        <ChampTexte
          name="mot_de_passe"
          type="password"
          label="Mot de passe"
          aide="12 caractères minimum. Une phrase facile à retenir fonctionne très bien."
          autoComplete="new-password"
          validate={validerMotDePasse}
          isRequired
        />
        <div className={styles.actions}>
          <Bouton type="submit" isPending={inscription.isPending}>
            Créer mon compte
          </Bouton>
        </div>
      </Form>

      <p>
        Déjà un compte ? <Link to="/connexion">Se connecter</Link>
      </p>
    </>
  );
}
