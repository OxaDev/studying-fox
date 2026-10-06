import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { ChampChoix } from "../../composants/ChampChoix";
import tableau from "../../composants/Tableau.module.css";
import styles from "./Admin.module.css";
import { ACTIONS, adminApi, lirePage } from "./api";
import { NavAdmin } from "./NavAdmin";
import { Pagination } from "./Pagination";

const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

const LIBELLES_DETAILS: Record<string, string> = {
  avant: "Avant",
  apres: "Après",
  version: "Version",
  lecon: "Leçon",
  lecons: "Leçons",
  fichier: "Fichier",
  nom: "Nom",
  nombre: "Nombre",
  via: "Via",
};

/** Journal des actions sensibles, conservé un an (ADR 0014). */
export function PageJournal() {
  const [parametres, setParametres] = useSearchParams();
  const action = parametres.get("action") ?? "";
  const page = lirePage(parametres.get("page"));
  const { data, error } = useQuery({
    queryKey: ["admin", "journal", action, page],
    queryFn: () => adminApi.journal(action, page),
  });

  return (
    <>
      <title>Journal — Administration — Le Renard Étudiant</title>
      <h1>Administration</h1>
      <NavAdmin />
      <h2>Journal des actions</h2>
      <p>Les actions sensibles des douze derniers mois, de la plus récente à la plus ancienne.</p>

      <div className={styles.recherche}>
        <ChampChoix
          label="Type d'action"
          name="action"
          valeur={action}
          onChange={(valeur) => {
            setParametres(valeur ? { action: valeur } : {});
          }}
          options={[
            { valeur: "", libelle: "Toutes" },
            ...Object.entries(ACTIONS).map(([valeur, libelle]) => ({ valeur, libelle })),
          ]}
        />
      </div>

      {error && <Alerte>{error.message}</Alerte>}
      {!data && !error && <p role="status">Chargement…</p>}
      {data?.total === 0 && <p>Aucune action enregistrée.</p>}
      {data && data.total > 0 && (
        <>
          <div className={tableau.cadre}>
            <table className={tableau.tableau}>
              <caption>
                {data.total} action{data.total > 1 ? "s" : ""}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Action</th>
                  <th scope="col">Par</th>
                  <th scope="col">Sur</th>
                  <th scope="col">Détails</th>
                </tr>
              </thead>
              <tbody>
                {data.actions.map((a) => (
                  <tr key={a.id}>
                    <td>{date.format(new Date(a.cree_le))}</td>
                    <th scope="row">{ACTIONS[a.action] ?? a.action}</th>
                    <td>{a.acteur}</td>
                    <td>{a.cible}</td>
                    <td>
                      <ul className={styles.details}>
                        {Object.entries(a.details).map(([cle, valeur]) => (
                          <li key={cle}>
                            {LIBELLES_DETAILS[cle] ?? cle} : {valeur}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={data.total} />
        </>
      )}
    </>
  );
}
