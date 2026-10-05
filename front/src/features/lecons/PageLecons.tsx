import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { leconsApi, NIVEAUX } from "./api";
import styles from "./PageLecons.module.css";

export function PageLecons() {
  const { data: lecons, error } = useQuery({ queryKey: ["lecons"], queryFn: leconsApi.lister });

  return (
    <>
      <title>Leçons — Le Renard Étudiant</title>
      <h1>Toutes les leçons</h1>
      {error && <Alerte>{error.message}</Alerte>}
      {!lecons && !error && <p role="status">Chargement des leçons…</p>}
      {lecons?.length === 0 && <p>Aucune leçon publiée pour l&apos;instant. Reviens bientôt !</p>}
      {lecons && lecons.length > 0 && (
        <ul className={styles.grille}>
          {lecons.map((lecon) => (
            <li key={lecon.slug} className={styles.carte}>
              <h2 className={styles.titre}>
                <Link to={`/lecons/${lecon.slug}`}>{lecon.titre}</Link>
              </h2>
              <p>{lecon.resume}</p>
              <p className={styles.meta}>
                {lecon.theme.nom} · {NIVEAUX[lecon.niveau]} · {lecon.duree_minutes} min
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
