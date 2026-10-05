import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { LienBouton } from "../../composants/LienBouton";
import { CercleProgression } from "../../composants/Progression";
import { useMoiConnecte } from "../comptes/session";
import { type Espace, parcoursApi } from "../parcours/api";
import { CarteParcours } from "../parcours/CarteParcours";
import styles from "./PageEspace.module.css";

/** Tableau de bord de l'apprenant (cadrage § 5.3, maquette « Mon espace »). */
export function PageEspace() {
  const moi = useMoiConnecte();
  const { data: espace, error } = useQuery({
    queryKey: ["progression"],
    queryFn: parcoursApi.espace,
  });

  return (
    <>
      <title>Mon espace — Le Renard Étudiant</title>
      <h1>Bonjour {moi.pseudo} !</h1>
      <p className={styles.intro}>Ravi de te revoir. Continue sur ta lancée !</p>

      {error && <Alerte>{error.message}</Alerte>}
      {!espace && !error && <p role="status">Chargement de ton avancement…</p>}
      {espace && <Tableau espace={espace} />}
    </>
  );
}

function lecons(nombre: number): string {
  const s = nombre > 1 ? "s" : "";
  return `${String(nombre)} leçon${s} terminée${s}`;
}

function Tableau({ espace }: { espace: Espace }) {
  const commence = espace.parcours_en_cours.length + espace.parcours_termines.length > 0;

  return (
    <>
      <div className={styles.haut}>
        <section aria-labelledby="titre-avancement" className={styles.avancement}>
          <CercleProgression pourcentage={espace.pourcentage} label="Avancement global" />
          <div>
            <h2 id="titre-avancement" className={styles.titreAvancement}>
              Ton avancement global
            </h2>
            {/* « parcours » est invariable. */}
            <p>{espace.parcours_en_cours.length} parcours en cours</p>
            <p>{lecons(espace.lecons_terminees)}</p>
          </div>
        </section>
        <p className={styles.encouragement}>Chaque leçon te rapproche de tes objectifs !</p>
      </div>

      <section aria-labelledby="titre-en-cours" className={styles.section}>
        <div className={styles.entete}>
          <h2 id="titre-en-cours">Mes parcours en cours</h2>
          <Link to="/parcours">Voir tous les parcours</Link>
        </div>
        {espace.parcours_en_cours.length > 0 ? (
          <ul className={styles.grille}>
            {espace.parcours_en_cours.map((parcours, index) => (
              <li key={parcours.slug}>
                <CarteParcours parcours={parcours} index={index} niveauTitre={3} />
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.vide}>
            <p>
              {commence
                ? "Tu as terminé tous tes parcours commencés. Et si tu en commençais un nouveau ?"
                : "Tu n'as pas encore commencé de parcours."}
            </p>
            <LienBouton to="/parcours">
              Découvrir les parcours <span aria-hidden="true">→</span>
            </LienBouton>
          </div>
        )}
      </section>

      {espace.parcours_termines.length > 0 && (
        <section aria-labelledby="titre-termines" className={styles.section}>
          <h2 id="titre-termines">Parcours terminés</h2>
          <ul className={styles.grille}>
            {espace.parcours_termines.map((parcours, index) => (
              <li key={parcours.slug}>
                <CarteParcours parcours={parcours} index={index + 2} niveauTitre={3} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
