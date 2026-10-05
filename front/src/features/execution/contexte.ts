import { createContext, useContext } from "react";

import { executeur, type Executeur } from "./executeur";

/** Permet aux tests de remplacer l'exécuteur réel. */
export const ContexteExecuteur = createContext<Pick<Executeur, "executer">>(executeur);

export function useExecuteur() {
  return useContext(ContexteExecuteur);
}
