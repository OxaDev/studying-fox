import type { SyntheticEvent } from "react";

/** Empêche l'envoi classique du formulaire et renvoie ses valeurs texte. */
export function lireFormulaire(evenement: SyntheticEvent<HTMLFormElement>): Record<string, string> {
  evenement.preventDefault();
  const valeurs: Record<string, string> = {};
  new FormData(evenement.currentTarget).forEach((valeur, nom) => {
    if (typeof valeur === "string") valeurs[nom] = valeur;
  });
  return valeurs;
}

export function validerMotDePasse(valeur: string): string | null {
  return valeur.length < 12 ? "12 caractères minimum." : null;
}

export function validerPseudo(valeur: string): string | null {
  const pseudo = valeur.trim();
  if (pseudo.length < 3 || pseudo.length > 30) return "Entre 3 et 30 caractères.";
  if (!/^[\p{L}\p{N}_.-]+$/u.test(pseudo)) {
    return "Lettres, chiffres, point, tiret et tiret bas uniquement.";
  }
  return null;
}
