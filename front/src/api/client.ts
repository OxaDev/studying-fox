/**
 * Appels à l'API. Les types viennent de src/api/schema.d.ts, généré depuis le schéma OpenAPI :
 * `uv run python -m app.openapi` (dans api/) puis `npm run api:types`.
 */
import type { components } from "./schema";

export type Schemas = components["schemas"];

type Methode = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export class ErreurApi extends Error {
  readonly statut: number;
  /** Erreurs par champ de formulaire, quand l'API refuse une valeur (422). */
  readonly champs: Record<string, string>;

  constructor(statut: number, message: string, champs: Record<string, string> = {}) {
    super(message);
    this.name = "ErreurApi";
    this.statut = statut;
    this.champs = champs;
  }
}

// Les erreurs des requêtes TanStack Query sont toujours des ErreurApi.
declare module "@tanstack/react-query" {
  interface Register {
    defaultError: ErreurApi;
  }
}

// Jeton CSRF de la session, renvoyé par /comptes/moi et /comptes/connexion (ADR 0008).
let jetonCsrf: string | null = null;

export function definirJetonCsrf(jeton: string | null): void {
  jetonCsrf = jeton;
}

interface ErreurDeChamp {
  loc: (string | number)[];
  msg?: string;
  type?: string;
}

async function lireErreur(reponse: Response): Promise<ErreurApi> {
  let detail: unknown = null;
  try {
    detail = ((await reponse.json()) as { detail?: unknown }).detail;
  } catch {
    // Corps vide ou illisible : on garde un message générique.
  }
  if (typeof detail === "string") {
    return new ErreurApi(reponse.status, detail);
  }
  if (Array.isArray(detail)) {
    const champs: Record<string, string> = {};
    for (const erreur of detail as ErreurDeChamp[]) {
      const nom = erreur.loc.at(-1);
      if (typeof nom !== "string") continue;
      // « champ_incomplet » : message déjà rédigé en français par l'API (contributions).
      champs[nom] =
        erreur.type === "champ_incomplet" && erreur.msg
          ? erreur.msg
          : "Cette valeur n'est pas acceptée.";
    }
    return new ErreurApi(reponse.status, "Certains champs sont à corriger.", champs);
  }
  if (reponse.status >= 500) {
    return new ErreurApi(
      reponse.status,
      "Le serveur a rencontré un problème. Réessaie dans un instant.",
    );
  }
  return new ErreurApi(reponse.status, "Une erreur est survenue.");
}

async function envoyer<T>(chemin: string, init: RequestInit): Promise<T> {
  let reponse: Response;
  try {
    reponse = await fetch(`/api${chemin}`, { ...init, credentials: "same-origin" });
  } catch {
    throw new ErreurApi(0, "Impossible de joindre le serveur. Vérifie ta connexion internet.");
  }
  if (!reponse.ok) throw await lireErreur(reponse);
  const texte = await reponse.text();
  return (texte ? JSON.parse(texte) : null) as T;
}

export function appelApi<T>(
  chemin: string,
  options: { methode?: Methode; corps?: unknown } = {},
): Promise<T> {
  const methode = options.methode ?? "GET";
  const headers = new Headers({ Accept: "application/json" });
  if (options.corps !== undefined) headers.set("Content-Type", "application/json");
  if (methode !== "GET" && jetonCsrf) headers.set("X-CSRF-Token", jetonCsrf);
  return envoyer<T>(chemin, {
    method: methode,
    headers,
    body: options.corps === undefined ? undefined : JSON.stringify(options.corps),
  });
}

/** Envoie un fichier (formulaire multipart, champ « fichier »). */
export function envoyerFichier<T>(chemin: string, fichier: File): Promise<T> {
  const corps = new FormData();
  corps.append("fichier", fichier);
  const headers = new Headers({ Accept: "application/json" });
  // L'en-tête CSRF est aussi ce qui autorise un envoi non-JSON (api/app/protection.py).
  if (jetonCsrf) headers.set("X-CSRF-Token", jetonCsrf);
  return envoyer<T>(chemin, { method: "POST", headers, body: corps });
}
