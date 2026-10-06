import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { CaseACocher } from "../../composants/CaseACocher";
import { LienBouton } from "../../composants/LienBouton";
import { relectureApi, STATUTS } from "./api";
import { CaseToutSelectionner, PublierLaSelection, useSelection } from "./PublicationGroupee";
import styles from "./Relecture.module.css";
import tableau from "../../composants/Tableau.module.css";

const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/** File des versions à relire (cadrage § 5.6). */
export function PageRelecture() {
  const { data: file, error } = useQuery({ queryKey: ["relecture"], queryFn: relectureApi.file });
  const selection = useSelection(file ?? [], "rien");

  return (
    <>
      <title>Relecture — Le Renard Étudiant</title>
      <div className={styles.entete}>
        <h1>Relecture</h1>
        <LienBouton to="/relecture/import">Importer des leçons</LienBouton>
      </div>

      {error && <Alerte>{error.message}</Alerte>}
      {!file && !error && <p role="status">Chargement de la file…</p>}
      {file?.length === 0 && <p>Rien à relire pour l&apos;instant. Beau travail !</p>}
      {file && file.length > 0 && (
        <>
          <div className={styles.actionsSelection}>
            <p>Coche des versions pour les publier en une fois.</p>
            <PublierLaSelection
              ids={selection.ids}
              onPubliees={(ids) => {
                for (const id of ids) selection.basculer(id, false);
              }}
            />
          </div>
          <div className={tableau.cadre}>
            <table className={tableau.tableau}>
              <caption>
                {file.length} version{file.length > 1 ? "s" : ""} à relire, de la plus ancienne à la
                plus récente
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <CaseToutSelectionner selection={selection} avecTexte={false} />
                  </th>
                  <th scope="col">Leçon</th>
                  <th scope="col">Version</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Auteur</th>
                  <th scope="col">Origine</th>
                  <th scope="col">Proposée le</th>
                </tr>
              </thead>
              <tbody>
                {file.map((element) => (
                  <tr key={element.revision_id}>
                    <td>
                      <CaseACocher
                        aria-label={
                          element.peut_publier
                            ? `Sélectionner « ${element.titre} »`
                            : `« ${element.titre} » : tu l'as écrite, une autre personne doit la publier`
                        }
                        isSelected={selection.estChoisi(element.revision_id)}
                        isDisabled={!element.peut_publier}
                        onChange={(coche) => {
                          selection.basculer(element.revision_id, coche);
                        }}
                      />
                    </td>
                    <th scope="row">
                      <Link to={`/relecture/${element.revision_id}`}>{element.titre}</Link>
                    </th>
                    <td>{element.numero}</td>
                    <td>{STATUTS[element.statut]}</td>
                    <td>
                      {element.auteur}
                      {element.assiste_par_ia && " (avec une IA)"}
                    </td>
                    <td>{element.fichier_importe ?? "Rédigée sur le site"}</td>
                    <td>{date.format(new Date(element.cree_le))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
