import type { ReactNode } from "react";

import styles from "./Alerte.module.css";
import { classes } from "./classes";

interface Props {
  /** « erreur » est lue tout de suite par les lecteurs d'écran, « succes » poliment. */
  type?: "erreur" | "succes";
  children: ReactNode;
}

export function Alerte({ type = "erreur", children }: Props) {
  return (
    <div
      role={type === "erreur" ? "alert" : "status"}
      className={classes(styles.alerte, styles[type])}
    >
      {children}
    </div>
  );
}
