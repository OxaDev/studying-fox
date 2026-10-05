import { useMutation } from "@tanstack/react-query";
import { Form } from "react-aria-components";
import { Link, useSearchParams } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { Bouton } from "../../composants/Bouton";
import { ChampTexte } from "../../composants/ChampTexte";
import styles from "../../composants/Formulaire.module.css";
import { lireFormulaire } from "../../composants/formulaire";
import { comptesApi } from "./api";

/**
 * Confirmation de l'adresse email. On attend un clic plutôt que de confirmer dès l'ouverture :
 * certains antivirus ouvrent les liens des emails, ce qui consommerait le jeton.
 */
export function PageConfirmation() {
  const [parametres] = useSearchParams();
  const jeton = parametres.get("jeton");
  const confirmation = useMutation({ mutationFn: comptesApi.confirmer });

  return (
    <>
      <title>Confirmer mon adresse — Le Renard Étudiant</title>
      <h1>Confirmer mon adresse</h1>

      {confirmation.isSuccess ? (
        <>
          <Alerte type="succes">Ton adresse est confirmée. Bienvenue !</Alerte>
          <p>
            <Link to="/connexion">Se connecter</Link>
          </p>
        </>
      ) : (
        jeton && (
          <>
            {confirmation.error && <Alerte>{confirmation.error.message}</Alerte>}
            <p>Un dernier clic pour activer ton compte.</p>
            <Bouton
              isPending={confirmation.isPending}
              onPress={() => {
                confirmation.mutate({ jeton });
              }}
            >
              Confirmer mon adresse
            </Bouton>
          </>
        )
      )}

      {(!jeton || confirmation.isError) && <RenvoyerLien />}
    </>
  );
}

function RenvoyerLien() {
  const renvoi = useMutation({ mutationFn: comptesApi.renvoyerConfirmation });

  return (
    <section aria-labelledby="titre-renvoi">
      <h2 id="titre-renvoi">Recevoir un nouveau lien</h2>
      {renvoi.isSuccess && (
        <Alerte type="succes">
          Si cette adresse attend une confirmation, un nouveau lien vient de partir.
        </Alerte>
      )}
      {renvoi.error && <Alerte>{renvoi.error.message}</Alerte>}
      <Form
        className={styles.formulaire}
        onSubmit={(evenement) => {
          const { email = "" } = lireFormulaire(evenement);
          renvoi.mutate({ email });
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
          <Bouton type="submit" variante="secondaire" isPending={renvoi.isPending}>
            Envoyer un nouveau lien
          </Bouton>
        </div>
      </Form>
    </section>
  );
}
