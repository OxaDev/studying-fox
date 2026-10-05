import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { classes } from "../../composants/classes";
import { parcoursApi } from "./api";
import { CarteParcours } from "./CarteParcours";
import styles from "./PageListeParcours.module.css";

export function PageListeParcours() {
  const [parametres] = useSearchParams();
  const themeChoisi = parametres.get("theme");
  const { data: parcours, error } = useQuery({
    queryKey: ["parcours"],
    queryFn: parcoursApi.lister,
  });

  const themes = new Map(parcours?.map((p) => [p.theme.slug, p.theme.nom]));
  const affiches = parcours?.filter((p) => !themeChoisi || p.theme.slug === themeChoisi);

  return (
    <>
      <title>Parcours — Le Renard Étudiant</title>
      <h1>Nos parcours</h1>
      <p className={styles.intro}>Choisis un parcours et avance pas à pas vers ton objectif.</p>

      {themes.size > 1 && (
        <nav aria-label="Filtrer par thème">
          <ul className={styles.filtres}>
            <li>
              <Link
                to="/parcours"
                className={classes(styles.filtre, !themeChoisi && styles.actif)}
                aria-current={!themeChoisi ? "true" : undefined}
              >
                Tous
              </Link>
            </li>
            {[...themes].map(([slug, nom]) => (
              <li key={slug}>
                <Link
                  to={`/parcours?theme=${slug}`}
                  className={classes(styles.filtre, themeChoisi === slug && styles.actif)}
                  aria-current={themeChoisi === slug ? "true" : undefined}
                >
                  {nom}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {error && <Alerte>{error.message}</Alerte>}
      {!parcours && !error && <p role="status">Chargement des parcours…</p>}
      {affiches?.length === 0 && <p>Aucun parcours pour l&apos;instant. Reviens bientôt !</p>}
      {affiches && affiches.length > 0 && (
        <ul className={styles.grille}>
          {affiches.map((p, index) => (
            <li key={p.slug}>
              <CarteParcours parcours={p} index={index} avecDescription />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
