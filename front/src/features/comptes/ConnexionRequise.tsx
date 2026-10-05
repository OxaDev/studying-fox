import { Navigate, Outlet, useLocation } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { useMoi } from "./session";

/** Protège les pages de l'application : sans session, on part vers la connexion. */
export function ConnexionRequise() {
  const { data: moi, isPending, isError } = useMoi();
  const { pathname, search } = useLocation();

  if (isPending) {
    return (
      <p role="status" className="visuellement-cache">
        Chargement…
      </p>
    );
  }
  if (isError) {
    return <Alerte>Le serveur ne répond pas. Réessaie dans un instant.</Alerte>;
  }
  if (!moi) {
    const retour = encodeURIComponent(pathname + search);
    return <Navigate to={`/connexion?retour=${retour}`} replace />;
  }
  return <Outlet />;
}
