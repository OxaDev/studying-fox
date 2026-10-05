import { Label, ProgressBar } from "react-aria-components";

import styles from "./Progression.module.css";

interface Props {
  faites: number;
  total: number;
  /** Nom lu par les lecteurs d'écran, par exemple « Avancement dans le parcours Python ». */
  label: string;
}

/** Barre d'avancement, toujours accompagnée du texte « 3/12 leçons » (identité visuelle). */
export function BarreProgression({ faites, total, label }: Props) {
  return (
    <ProgressBar
      className={styles.barre}
      value={faites}
      maxValue={Math.max(total, 1)}
      aria-label={label}
      valueLabel={`${String(faites)} sur ${String(total)} leçons terminées`}
    >
      {({ percentage = 0 }) => (
        <>
          <div className={styles.piste}>
            <div className={styles.remplissage} style={{ width: `${String(percentage)}%` }} />
          </div>
          <span className={styles.texte} aria-hidden="true">
            {faites}/{total} leçons
          </span>
        </>
      )}
    </ProgressBar>
  );
}

const RAYON = 42;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

/** Cercle d'avancement en pourcentage (écran « Mon espace »). */
export function CercleProgression({ pourcentage, label }: { pourcentage: number; label: string }) {
  return (
    <ProgressBar className={styles.cercle} value={pourcentage}>
      {({ valueText }) => (
        <>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle className={styles.fondCercle} cx="50" cy="50" r={RAYON} />
            <circle
              className={styles.arc}
              cx="50"
              cy="50"
              r={RAYON}
              strokeDasharray={CIRCONFERENCE}
              strokeDashoffset={CIRCONFERENCE * (1 - pourcentage / 100)}
            />
          </svg>
          <span className={styles.pourcentage}>{valueText}</span>
          <Label className="visuellement-cache">{label}</Label>
        </>
      )}
    </ProgressBar>
  );
}
