import type { ReactNode } from "react";
import { Link } from "react-router";

import { BarreProgression } from "../../composants/Progression";
import { NIVEAUX } from "../lecons/api";
import type { ResumeParcours } from "./api";
import styles from "./CarteParcours.module.css";

// Couleurs des en-têtes de cartes (identité visuelle), attribuées dans l'ordre.
const PASTELS = ["peche", "menthe", "soleil", "sakura", "ciel"] as const;

interface Props {
  parcours: ResumeParcours;
  index: number;
  /** Niveau de titre selon la page : h2 dans une liste, h3 sous une section. */
  niveauTitre?: 2 | 3;
  avecDescription?: boolean;
  /** Remplace la description affichée (texte surligné de la recherche). */
  description?: ReactNode;
}

/** Carte de parcours : en-tête pastel, titre, mots-clés, avancement. */
export function CarteParcours({
  parcours,
  index,
  niveauTitre = 2,
  avecDescription = false,
  description,
}: Props) {
  const Titre = niveauTitre === 2 ? "h2" : "h3";
  const pastel = PASTELS[index % PASTELS.length] ?? "ciel";

  return (
    <article className={styles.carte}>
      <div className={styles.entete} style={{ background: `var(--${pastel})` }}>
        <span className={styles.theme}>{parcours.theme.nom}</span>
      </div>
      <div className={styles.corps}>
        <Titre className={styles.titre}>
          <Link to={`/parcours/${parcours.slug}`} className={styles.lien}>
            {parcours.titre}
          </Link>
        </Titre>
        <p className={styles.meta}>
          {NIVEAUX[parcours.niveau]} · {parcours.nb_lecons} leçons · {parcours.duree_minutes} min
        </p>
        {avecDescription && (
          <p className={styles.description}>{description ?? parcours.description}</p>
        )}
        <div className={styles.progression}>
          <BarreProgression
            faites={parcours.nb_terminees}
            total={parcours.nb_lecons}
            label={`Avancement dans ${parcours.titre}`}
          />
        </div>
      </div>
    </article>
  );
}
