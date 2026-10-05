import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { LienBouton } from "../../composants/LienBouton";
import { BarreProgression } from "../../composants/Progression";
import { NIVEAUX } from "../lecons/api";
import { type ParcoursDetail, parcoursApi } from "./api";
import styles from "./PageParcours.module.css";

export function PageParcours() {
  const { parcours: slug = "" } = useParams();
  const { data: parcours, error } = useQuery({
    queryKey: ["parcours", slug],
    queryFn: () => parcoursApi.lire(slug),
  });

  if (error) {
    return (
      <>
        <title>Parcours introuvable — Le Renard Étudiant</title>
        <h1>
          {error.statut === 404 ? "Parcours introuvable" : "Impossible d'afficher le parcours"}
        </h1>
        {error.statut !== 404 && <Alerte>{error.message}</Alerte>}
        <p>
          <Link to="/parcours">Voir tous les parcours</Link>
        </p>
      </>
    );
  }
  if (!parcours) return <p role="status">Chargement du parcours…</p>;
  return <Parcours parcours={parcours} />;
}

function texteBouton(parcours: ParcoursDetail): string {
  if (parcours.nb_terminees === 0) return "Commencer le parcours";
  if (parcours.prochaine_lecon) return "Continuer le parcours";
  return "Revoir le parcours";
}

function Parcours({ parcours }: { parcours: ParcoursDetail }) {
  const cible = parcours.prochaine_lecon ?? parcours.lecons[0]?.slug;

  return (
    <>
      <title>{`${parcours.titre} — Le Renard Étudiant`}</title>
      <nav aria-label="Fil d'Ariane" className="ariane">
        <ol>
          <li>
            <Link to="/parcours">Parcours</Link>
          </li>
          <li aria-current="page">{parcours.titre}</li>
        </ol>
      </nav>

      <header className={styles.bandeau}>
        <h1>{parcours.titre}</h1>
        <p>{parcours.description}</p>
        <p className={styles.meta}>
          {parcours.theme.nom} · {NIVEAUX[parcours.niveau]} · {parcours.duree_minutes} min
        </p>
        <div className={styles.progression}>
          <BarreProgression
            faites={parcours.nb_terminees}
            total={parcours.nb_lecons}
            label={`Avancement dans ${parcours.titre}`}
          />
        </div>
        {parcours.prochaine_lecon === null && parcours.nb_lecons > 0 && (
          <p className={styles.bravo}>Bravo, tu as terminé ce parcours !</p>
        )}
        {cible && (
          <LienBouton to={`/parcours/${parcours.slug}/${cible}`}>
            {texteBouton(parcours)} <span aria-hidden="true">→</span>
          </LienBouton>
        )}
      </header>

      <section aria-labelledby="titre-lecons">
        <h2 id="titre-lecons">Les leçons du parcours</h2>
        <ol className={styles.lecons}>
          {parcours.lecons.map((lecon) => (
            <li key={lecon.slug} className={styles.lecon} data-terminee={lecon.terminee}>
              <Link to={`/parcours/${parcours.slug}/${lecon.slug}`}>{lecon.titre}</Link>
              <span className={styles.duree}>{lecon.duree_minutes} min</span>
              <span className={styles.etat}>
                {lecon.terminee ? (
                  <>
                    <span aria-hidden="true">✓</span>
                    <span className="visuellement-cache">terminée</span>
                  </>
                ) : (
                  <span className="visuellement-cache">à faire</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
