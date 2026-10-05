import { useQuery, useQueryClient } from "@tanstack/react-query";

import { definirJetonCsrf, ErreurApi } from "../../api/client";
import { comptesApi, type Moi } from "./api";

export const CLE_MOI = ["comptes", "moi"] as const;

/** L'utilisateur connecté, ou null s'il n'y a pas de session. */
export function useMoi() {
  return useQuery({
    queryKey: CLE_MOI,
    queryFn: async (): Promise<Moi | null> => {
      try {
        const moi = await comptesApi.moi();
        definirJetonCsrf(moi.jeton_csrf);
        return moi;
      } catch (erreur) {
        if (erreur instanceof ErreurApi && erreur.statut === 401) return null;
        throw erreur;
      }
    },
    staleTime: 5 * 60_000,
  });
}

/** À utiliser sous <ConnexionRequise> : l'utilisateur y est toujours connu. */
export function useMoiConnecte(): Moi {
  const { data } = useMoi();
  if (!data) throw new Error("useMoiConnecte doit être utilisé sous <ConnexionRequise>");
  return data;
}

export function useSession() {
  const queryClient = useQueryClient();
  return {
    ouvrir(moi: Moi) {
      definirJetonCsrf(moi.jeton_csrf);
      queryClient.setQueryData(CLE_MOI, moi);
    },
    fermer() {
      definirJetonCsrf(null);
      queryClient.setQueryData(CLE_MOI, null);
    },
  };
}

/** Adresse où revenir après la connexion. Refuse les adresses externes. */
export function adresseDeRetour(retour: string | null): string {
  return retour?.startsWith("/") && !retour.startsWith("//") ? retour : "/";
}

/**
 * Réglages des comptes. Tant qu'ils chargent (ou si l'API ne répond pas), on suppose
 * qu'il n'y a pas de vérification de l'email, comme en production aujourd'hui (ADR 0023).
 */
export function useVerificationEmail(): boolean {
  const { data } = useQuery({
    queryKey: ["comptes", "reglages"],
    queryFn: comptesApi.reglages,
    staleTime: Infinity,
  });
  return data?.verification_email ?? false;
}
