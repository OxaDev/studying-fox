import { Outlet } from "react-router";

import styles from "./GabaritPublic.module.css";

/** Pages accessibles sans connexion : connexion, inscription, mot de passe oublié… */
export function GabaritPublic() {
  return (
    <>
      <a href="#contenu" className="evitement">
        Aller au contenu
      </a>
      <header className={styles.entete}>
        <a href="/" className={styles.logo}>
          Le Renard Étudiant
        </a>
      </header>
      <main id="contenu" tabIndex={-1} className={styles.contenu}>
        <div className={styles.carte}>
          <Outlet />
        </div>
      </main>
    </>
  );
}
