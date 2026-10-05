import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { CLE_MOI } from "../features/comptes/session";
import { definirJetonCsrf, ErreurApi } from "./client";

/** Client TanStack Query. Une réponse 401 signifie que la session a expiré : on l'oublie. */
export function creerQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    queryCache: new QueryCache({ onError: siSessionExpiree }),
    mutationCache: new MutationCache({ onError: siSessionExpiree }),
  });

  function siSessionExpiree(erreur: Error): void {
    if (erreur instanceof ErreurApi && erreur.statut === 401) {
      definirJetonCsrf(null);
      client.setQueryData(CLE_MOI, null);
    }
  }

  return client;
}
