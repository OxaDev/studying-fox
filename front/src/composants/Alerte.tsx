import type { ReactNode } from "react";

import styles from "./Alerte.module.css";
import { classes } from "./classes";

interface Props {
  /** « erreur » est lue tout de suite par les lecteurs d'écran, « succes » poliment. */
  type?: "erreur" | "succes";
  children: ReactNode;
}

/** Message d'erreur ou de succès. L'icône double la couleur, qui ne suffit pas seule (RGAA 3.1). */
export function Alerte({ type = "erreur", children }: Props) {
  return (
    <div
      role={type === "erreur" ? "alert" : "status"}
      className={classes(styles.alerte, styles[type])}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" className={styles.icone}>
        <circle cx="12" cy="12" r="10" />
        {type === "erreur" ? <path d="M12 7v6M12 16.5v.5" /> : <path d="m7.5 12.5 3 3 6-6.5" />}
      </svg>
      <div className={styles.texte}>{children}</div>
    </div>
  );
}
