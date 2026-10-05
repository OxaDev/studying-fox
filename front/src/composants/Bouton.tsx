import { Button, type ButtonProps } from "react-aria-components";

import styles from "./Bouton.module.css";
import { classes } from "./classes";

interface Props extends Omit<ButtonProps, "className"> {
  variante?: "primaire" | "secondaire";
}

/** Bouton en forme de pilule (identité visuelle). Accessible au clavier grâce à React Aria. */
export function Bouton({ variante = "primaire", children, ...props }: Props) {
  return (
    <Button {...props} className={classes(styles.bouton, styles[variante])}>
      {(etat) => (
        <>
          {typeof children === "function" ? children(etat) : children}
          {etat.isPending && <span className="visuellement-cache"> (en cours)</span>}
        </>
      )}
    </Button>
  );
}
