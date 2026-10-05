import { useMutation } from "@tanstack/react-query";
import { Form } from "react-aria-components";
import { Link, useSearchParams } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { Bouton } from "../../composants/Bouton";
import { ChampTexte } from "../../composants/ChampTexte";
import styles from "../../composants/Formulaire.module.css";
import { lireFormulaire, validerMotDePasse } from "../../composants/formulaire";
import { comptesApi } from "./api";
import { useSession } from "./session";

export function PageReinitialisation() {
  const [parametres] = useSearchParams();
  const jeton = parametres.get("jeton");
  const session = useSession();
  const reinitialisation = useMutation({
    mutationFn: comptesApi.reinitialiser,
    // Toutes les sessions sont fermées côté serveur, y compris celle de ce navigateur.
    onSuccess: () => {
      session.fermer();
    },
  });

  return (
    <>
      <title>Nouveau mot de passe — Le Renard Étudiant</title>
      <h1>Nouveau mot de passe</h1>

      {!jeton ? (
        <Alerte>
          <p>Ce lien est incomplet.</p>
          <p>
            <Link to="/mot-de-passe-oublie">Demander un nouveau lien</Link>
          </p>
        </Alerte>
      ) : reinitialisation.isSuccess ? (
        <>
          <Alerte type="succes">Ton mot de passe est changé.</Alerte>
          <p>
            <Link to="/connexion">Se connecter</Link>
          </p>
        </>
      ) : (
        <>
          {reinitialisation.error && (
            <Alerte>
              <p>{reinitialisation.error.message}</p>
              <p>
                <Link to="/mot-de-passe-oublie">Demander un nouveau lien</Link>
              </p>
            </Alerte>
          )}
          <Form
            className={styles.formulaire}
            validationErrors={reinitialisation.error?.champs}
            onSubmit={(evenement) => {
              const { nouveau = "" } = lireFormulaire(evenement);
              reinitialisation.mutate({ jeton, nouveau });
            }}
          >
            <ChampTexte
              name="nouveau"
              type="password"
              label="Nouveau mot de passe"
              aide="12 caractères minimum."
              autoComplete="new-password"
              validate={validerMotDePasse}
              isRequired
            />
            <div className={styles.actions}>
              <Bouton type="submit" isPending={reinitialisation.isPending}>
                Enregistrer
              </Bouton>
            </div>
          </Form>
        </>
      )}
    </>
  );
}
