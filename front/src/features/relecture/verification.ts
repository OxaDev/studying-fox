import type { Executeur } from "../execution/executeur";
import type { Resultat } from "../execution/types";
import type { CodeAVerifier } from "./api";

export type EtatVerification =
  | { etat: "en_attente" }
  | { etat: "en_cours" }
  | { etat: "conforme"; obtenu: string }
  | { etat: "different"; obtenu: string; attendu: string }
  | { etat: "erreur"; message: string };

function sortieStandard(resultat: Resultat): string {
  return resultat.sorties
    .filter((sortie) => sortie.flux === "stdout")
    .map((sortie) => sortie.texte)
    .join("");
}

/**
 * Compare le résultat d'une exécution à la sortie attendue (ADR 0019).
 * Les espaces et retours à la ligne en fin de sortie ne comptent pas.
 */
export function comparer(resultat: Resultat, attendue: string | null): EtatVerification {
  if (resultat.statut === "delai") {
    return { etat: "erreur", message: "Le code a dépassé le temps maximum d'exécution." };
  }
  if (resultat.statut === "erreur") {
    const erreurs = resultat.sorties.filter((sortie) => sortie.flux === "stderr");
    return {
      etat: "erreur",
      message: erreurs
        .map((sortie) => sortie.texte)
        .join("")
        .trim(),
    };
  }
  const obtenu = sortieStandard(resultat);
  if (attendue !== null && obtenu.trimEnd() !== attendue.trimEnd()) {
    return { etat: "different", obtenu, attendu: attendue };
  }
  return { etat: "conforme", obtenu };
}

/** Exécute chaque code, l'un après l'autre, et signale l'avancement. */
export async function verifierCodes(
  executeur: Pick<Executeur, "executer">,
  codes: CodeAVerifier[],
  surEtat: (index: number, etat: EtatVerification) => void,
): Promise<boolean> {
  let toutConforme = true;
  for (const [index, code] of codes.entries()) {
    surEtat(index, { etat: "en_cours" });
    const resultat = await executeur.executer(code.langage, code.code);
    const etat = comparer(resultat, code.sortie_attendue ?? null);
    toutConforme &&= etat.etat === "conforme";
    surEtat(index, etat);
  }
  return toutConforme;
}
