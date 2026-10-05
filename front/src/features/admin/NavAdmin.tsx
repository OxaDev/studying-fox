import { NavLink } from "react-router";

import styles from "./Admin.module.css";

/** Navigation entre les écrans d'administration. */
export function NavAdmin() {
  return (
    <nav aria-label="Administration" className={styles.nav}>
      <ul>
        <li>
          <NavLink to="/admin/utilisateurs">Utilisateurs</NavLink>
        </li>
        <li>
          <NavLink to="/admin/themes">Thèmes</NavLink>
        </li>
        <li>
          <NavLink to="/admin/journal">Journal</NavLink>
        </li>
      </ul>
    </nav>
  );
}
