import { useMutation } from "@tanstack/react-query";
import { Form } from "react-aria-components";
import { Link } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { Bouton } from "../../composants/Bouton";
import { ChampTexte } from "../../composants/ChampTexte";
import styles from "../../composants/Formulaire.module.css";
import { lireFormulaire } from "../../composants/formulaire";
import { comptesApi } from "./api";

export function PageMotDePasseOublie() {
  const demande = useMutation({ mutationFn: comptesApi.motDePasseOublie });

  return (
    <>
      <title>Mot de passe oublié — Le Renard Étudiant</title>
      <h1>Mot de passe oublié</h1>

      {demande.isSuccess ? (
        <Alerte type="succes">
          <p>Si un compte existe pour cette adresse, un email vient de partir.</p>
          <p>Le lien qu&apos;il contient est valable 1 heure.</p>
        </Alerte>
      ) : (
        <>
          <p>
            Indique ton adresse : on t&apos;envoie un lien pour choisir un nouveau mot de passe.
          </p>
          {demande.error && <Alerte>{demande.error.message}</Alerte>}
          <Form
            className={styles.formulaire}
            onSubmit={(evenement) => {
              const { email = "" } = lireFormulaire(evenement);
              demande.mutate({ email });
            }}
          >
            <ChampTexte
              name="email"
              type="email"
              label="Adresse email"
              autoComplete="email"
              isRequired
            />
            <div className={styles.actions}>
              <Bouton type="submit" isPending={demande.isPending}>
                Recevoir le lien
              </Bouton>
            </div>
          </Form>
        </>
      )}

      <p>
        <Link to="/connexion">Retour à la connexion</Link>
      </p>
    </>
  );
}
