import styles from "./FeuillesCalcul.module.css";
import type { CelluleAffichee, FeuilleAffichee } from "./types";
import { lettresColonne } from "./vba/classeur";

/** Les feuilles du classeur simulé, après un code VBA (ADR 0026). */
export function FeuillesCalcul({ feuilles }: { feuilles: FeuilleAffichee[] }) {
  return (
    <div className={styles.feuilles}>
      {feuilles.map((feuille) => (
        <div key={feuille.nom} className={styles.cadre}>
          <table className={styles.feuille}>
            <caption>
              Feuille « {feuille.nom} »
              {feuille.tronquee && " : seul le début de la feuille est affiché"}
            </caption>
            <thead>
              <tr>
                <td />
                {(feuille.lignes[0] ?? []).map((_, colonne) => (
                  <th key={colonne} scope="col">
                    {lettresColonne(colonne + 1)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {feuille.lignes.map((cellules, ligne) => (
                <tr key={ligne}>
                  <th scope="row">{ligne + 1}</th>
                  {cellules.map((cellule, colonne) => (
                    <Cellule key={colonne} cellule={cellule} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function Cellule({ cellule }: { cellule: CelluleAffichee | null }) {
  if (!cellule) return <td />;
  let contenu = <>{cellule.texte}</>;
  if (cellule.italique) contenu = <em>{contenu}</em>;
  if (cellule.gras) contenu = <strong>{contenu}</strong>;
  return <td className={cellule.nombre ? styles.nombre : undefined}>{contenu}</td>;
}

/** Phrase annoncée aux lecteurs d'écran : le tableau, lui, n'est pas dans la zone annoncée. */
export function resumeFeuilles(feuilles: FeuilleAffichee[]): string {
  const noms = feuilles.map((feuille) => `« ${feuille.nom} »`).join(", ");
  return feuilles.length === 1
    ? `Le classeur contient la feuille ${noms}, affichée ci-dessous.`
    : `Le classeur contient les feuilles ${noms}, affichées ci-dessous.`;
}
