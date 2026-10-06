import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { LienBouton } from "../../composants/LienBouton";
import { STATUTS } from "../relecture/api";
import styles from "../relecture/Relecture.module.css";
import { contributionApi } from "./api";
import tableau from "../../composants/Tableau.module.css";

const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/** Les leçons et propositions de modification de l'utilisateur (cadrage § 5.5). */
export function PageContributions() {
  const { data: contributions, error } = useQuery({
    queryKey: ["contributions"],
    queryFn: contributionApi.lister,
  });

  return (
    <>
      <title>Mes contributions — Le Renard Étudiant</title>
      <div className={styles.entete}>
        <h1>Mes contributions</h1>
        <LienBouton to="/contributions/nouvelle">Écrire une nouvelle leçon</LienBouton>
      </div>
      <p>Pour améliorer une leçon existante, ouvre-la et choisis « Proposer une modification ».</p>

      {error && <Alerte>{error.message}</Alerte>}
      {!contributions && !error && <p role="status">Chargement…</p>}
      {contributions?.length === 0 && <p>Tu n&apos;as encore rien proposé. Lance-toi !</p>}
      {contributions && contributions.length > 0 && (
        <div className={tableau.cadre}>
          <table className={tableau.tableau}>
            <caption>Tes contributions, de la plus récente à la plus ancienne</caption>
            <thead>
              <tr>
                <th scope="col">Leçon</th>
                <th scope="col">Type</th>
                <th scope="col">Version</th>
                <th scope="col">Statut</th>
                <th scope="col">Modifiée le</th>
              </tr>
            </thead>
            <tbody>
              {contributions.map((c) => (
                <tr key={c.revision_id}>
                  <th scope="row">
                    <Link to={`/contributions/${c.revision_id}`}>{c.titre || c.lecon_slug}</Link>
                  </th>
                  <td>{c.nouvelle_lecon ? "Nouvelle leçon" : "Modification"}</td>
                  <td>{c.numero}</td>
                  <td>{STATUTS[c.statut]}</td>
                  <td>{date.format(new Date(c.modifiee_le))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
