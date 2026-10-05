import { Link, type LinkProps } from "react-router";

import styles from "./Bouton.module.css";
import { classes } from "./classes";

interface Props extends Omit<LinkProps, "className"> {
  variante?: "primaire" | "secondaire";
}

/** Lien qui a l'apparence d'un bouton (« Continuer le parcours → »). Reste un lien pour l'accessibilité. */
export function LienBouton({ variante = "primaire", ...props }: Props) {
  return <Link {...props} className={classes(styles.bouton, styles.lien, styles[variante])} />;
}
