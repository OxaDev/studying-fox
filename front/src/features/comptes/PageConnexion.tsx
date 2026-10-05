import { useMutation } from "@tanstack/react-query";
import { Form } from "react-aria-components";
import { Link, useNavigate, useSearchParams } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { Bouton } from "../../composants/Bouton";
import { ChampTexte } from "../../composants/ChampTexte";
import styles from "../../composants/Formulaire.module.css";
import { lireFormulaire } from "../../composants/formulaire";
import { comptesApi } from "./api";
import { adresseDeRetour, useSession, useVerificationEmail } from "./session";

export function PageConnexion() {
  const [parametres] = useSearchParams();
  const navigate = useNavigate();
  const session = useSession();
  const verification = useVerificationEmail();
  const connexion = useMutation({
    mutationFn: comptesApi.connexion,
    onSuccess: (moi) => {
      session.ouvrir(moi);
      void navigate(adresseDeRetour(parametres.get("retour")), { replace: true });
    },
  });
  const emailNonConfirme =
    connexion.error?.statut === 403 && connexion.error.message.startsWith("Confirme");

  return (
    <>
      <title>Connexion — Le Renard Étudiant</title>
      <h1>Connexion</h1>
      {parametres.get("compte") === "supprime" && (
        <Alerte type="succes">Ton compte a bien été supprimé. À bientôt peut-être !</Alerte>
      )}
      {parametres.get("compte") === "cree" && (
        <Alerte type="succes">Ton compte est créé. Connecte-toi pour commencer !</Alerte>
      )}
      {!parametres.get("compte") && <p>Content de te revoir !</p>}

      {connexion.error && (
        <Alerte>
          <p>{connexion.error.message}</p>
          {emailNonConfirme && (
            <p>
              <Link to="/confirmation">Recevoir un nouveau lien de confirmation</Link>
            </p>
          )}
        </Alerte>
      )}

      <Form
        className={styles.formulaire}
        validationErrors={connexion.error?.champs}
        onSubmit={(evenement) => {
          const { email = "", mot_de_passe = "" } = lireFormulaire(evenement);
          connexion.mutate({ email, mot_de_passe });
        }}
      >
        <p className={styles.mention}>Tous les champs sont obligatoires.</p>
        <ChampTexte
          name="email"
          type="email"
          label="Adresse email"
          autoComplete="email"
          defaultValue={parametres.get("email") ?? ""}
          isRequired
        />
        <ChampTexte
          name="mot_de_passe"
          type="password"
          label="Mot de passe"
          autoComplete="current-password"
          isRequired
        />
        <div className={styles.actions}>
          <Bouton type="submit" isPending={connexion.isPending}>
            Se connecter
          </Bouton>
        </div>
      </Form>

      {/* Sans service d'envoi, le lien de réinitialisation ne partirait pas (ADR 0023). */}
      {verification && (
        <p>
          <Link to="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
        </p>
      )}
      <p>
        Pas encore de compte ? <Link to="/inscription">Créer un compte</Link>
      </p>
    </>
  );
}
