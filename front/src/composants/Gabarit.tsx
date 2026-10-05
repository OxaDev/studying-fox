import { useMutation } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router";

import { comptesApi } from "../features/comptes/api";
import { aLeRole } from "../features/comptes/roles";
import { useMoiConnecte, useSession } from "../features/comptes/session";
import { Bouton } from "./Bouton";
import styles from "./Gabarit.module.css";

/** Structure des pages connectées : lien d'évitement, en-tête, contenu. */
export function Gabarit() {
  const moi = useMoiConnecte();
  const session = useSession();
  const navigate = useNavigate();
  const deconnexion = useMutation({
    mutationFn: comptesApi.deconnexion,
    onSettled: () => {
      session.fermer();
      void navigate("/connexion");
    },
  });

  return (
    <>
      <a href="#contenu" className="evitement">
        Aller au contenu
      </a>
      <header className={styles.entete}>
        <a href="/" className={styles.logo}>
          Le Renard Étudiant
        </a>
        <nav aria-label="Navigation principale">
          <ul className={styles.menu}>
            <li>
              <NavLink to="/" end>
                Mon espace
              </NavLink>
            </li>
            <li>
              <NavLink to="/parcours">Parcours</NavLink>
            </li>
            <li>
              <NavLink to="/lecons">Leçons</NavLink>
            </li>
            <li>
              <NavLink to="/profil">Mon profil</NavLink>
            </li>
            {aLeRole(moi.role, "contributeur") && (
              <li>
                <NavLink to="/contributions">Contribuer</NavLink>
              </li>
            )}
            {aLeRole(moi.role, "relecteur") && (
              <li>
                <NavLink to="/relecture">Relecture</NavLink>
              </li>
            )}
            {aLeRole(moi.role, "admin") && (
              <li>
                <NavLink to="/admin">Administration</NavLink>
              </li>
            )}
          </ul>
        </nav>
        <div className={styles.compte}>
          <NavLink to="/recherche" className={styles.recherche}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m15.5 15.5 5 5" />
            </svg>
            <span className="visuellement-cache">Rechercher</span>
          </NavLink>
          <span>
            <span className="visuellement-cache">Connecté en tant que </span>
            {moi.pseudo}
          </span>
          <Bouton
            variante="secondaire"
            isPending={deconnexion.isPending}
            onPress={() => {
              deconnexion.mutate();
            }}
          >
            Se déconnecter
          </Bouton>
        </div>
      </header>
      <main id="contenu" tabIndex={-1} className={styles.contenu}>
        <Outlet />
      </main>
    </>
  );
}
