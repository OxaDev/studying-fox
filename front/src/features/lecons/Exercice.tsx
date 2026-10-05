import { createContext, type ReactNode, useId } from "react";
import { Button, Disclosure, DisclosurePanel } from "react-aria-components";

import { BlocCode } from "../execution/BlocCode";
import styles from "./Markdown.module.css";

/** Vrai à l'intérieur d'un exercice : le code à lancer devient « ton code ». */
export const ContexteExercice = createContext(false);

/** Un exercice (docs/markdown-lecons.md) : consigne, code de départ, puis solution masquée. */
export function Exercice({ children }: { children: ReactNode }) {
  const idTitre = useId();
  return (
    <div role="group" aria-labelledby={idTitre} className={styles.exercice}>
      <p id={idTitre} className={styles.titreEncadre}>
        Exercice
      </p>
      <ContexteExercice.Provider value={true}>{children}</ContexteExercice.Provider>
    </div>
  );
}

/** La solution, en lecture seule et masquée tant que l'apprenant ne la demande pas. */
export function Solution({ langage, code }: { langage: string; code: string }) {
  return (
    <Disclosure className={styles.solution}>
      {({ isExpanded }) => (
        <>
          <Button slot="trigger" className={styles.boutonSolution}>
            <IconeOeil barre={isExpanded} />
            {isExpanded ? "Masquer la solution" : "Afficher la solution"}
          </Button>
          <DisclosurePanel>
            <BlocCode langage={langage} code={code} executable={false} titre="Solution" />
          </DisclosurePanel>
        </>
      )}
    </Disclosure>
  );
}

/** Œil ouvert pour afficher, barré pour masquer. Décoratif : le texte du bouton suffit. */
function IconeOeil({ barre }: { barre: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {barre && <path d="M4 4l16 16" />}
    </svg>
  );
}
