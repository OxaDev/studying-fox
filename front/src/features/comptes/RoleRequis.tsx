import { Link, Outlet } from "react-router";

import type { Moi } from "./api";
import { aLeRole } from "./roles";
import { useMoiConnecte } from "./session";

/** Réserve des pages à un rôle. L'API refuse de toute façon les accès non autorisés. */
export function RoleRequis({ minimum }: { minimum: Moi["role"] }) {
  const moi = useMoiConnecte();
  if (aLeRole(moi.role, minimum)) return <Outlet />;
  return (
    <>
      <title>Accès réservé — Le Renard Étudiant</title>
      <h1>Accès réservé</h1>
      <p>
        {
          {
            apprenant: "",
            contributeur:
              "Cette page est réservée aux contributeurs. Demande ce rôle à un administrateur.",
            relecteur: "Cette page est réservée aux relecteurs et aux administrateurs.",
            admin: "Cette page est réservée aux administrateurs.",
          }[minimum]
        }
      </p>
      <p>
        <Link to="/">Retourner à mon espace</Link>
      </p>
    </>
  );
}
