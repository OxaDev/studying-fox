import { useId, useState } from "react";

import { Bouton } from "../../composants/Bouton";
import { classes } from "../../composants/classes";
import styles from "./BlocCode.module.css";
import { useExecuteur } from "./contexte";
import { DELAI_MS } from "./executeur";
import { EditeurCode } from "./EditeurCode";
import { estLangage, LANGAGES, type Langage, type Resultat } from "./types";

interface Props {
  langage: string;
  code: string;
  executable: boolean;
  /** Remplace le titre par défaut (« Exemple Python à essayer », ou le nom du langage). */
  titre?: string;
}

/** Bloc de code d'une leçon. S'il est exécutable, l'apprenant peut le modifier et le lancer. */
export function BlocCode({ langage, code, executable, titre }: Props) {
  const nom = estLangage(langage) ? LANGAGES[langage] : langage;
  if (executable && estLangage(langage)) {
    return (
      <BlocExecutable langage={langage} code={code} titre={titre ?? `Exemple ${nom} à essayer`} />
    );
  }
  const legende = titre && nom ? `${titre} (${nom})` : (titre ?? nom);
  return (
    <figure className={styles.bloc}>
      {legende && <figcaption className={styles.barre}>{legende}</figcaption>}
      <pre className={styles.statique}>
        <code>{code}</code>
      </pre>
    </figure>
  );
}

type Etat = "repos" | "chargement" | "execution";

function BlocExecutable({
  langage,
  code,
  titre,
}: {
  langage: Langage;
  code: string;
  titre: string;
}) {
  const executeur = useExecuteur();
  const [valeur, setValeur] = useState(code);
  const [etat, setEtat] = useState<Etat>("repos");
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const idTitre = useId();
  const nom = LANGAGES[langage];

  async function lancer() {
    setResultat(null);
    setEtat("execution");
    const nouveau = await executeur.executer(langage, valeur, {
      surChargement: () => {
        setEtat("chargement");
      },
      surDebut: () => {
        setEtat("execution");
      },
    });
    setResultat(nouveau);
    setEtat("repos");
  }

  return (
    <div role="group" className={styles.bloc} aria-labelledby={idTitre}>
      <div className={styles.barre}>
        <span id={idTitre} className={styles.titre}>
          {titre}
        </span>
        <div className={styles.actions}>
          <Bouton isPending={etat !== "repos"} onPress={() => void lancer()}>
            Exécuter
          </Bouton>
          <Bouton
            variante="secondaire"
            isDisabled={valeur === code || etat !== "repos"}
            onPress={() => {
              setValeur(code);
              setResultat(null);
            }}
          >
            Réinitialiser
          </Bouton>
        </div>
      </div>
      <EditeurCode
        valeur={valeur}
        langage={langage}
        label={`Code ${nom}, modifiable`}
        onChange={setValeur}
      />
      <div className={styles.sortie} aria-live="polite">
        {etat === "chargement" && <p>Chargement de Python… (la première fois seulement)</p>}
        {resultat && <AffichageResultat resultat={resultat} />}
      </div>
    </div>
  );
}

const MESSAGES: Record<Resultat["statut"], string> = {
  ok: "Résultat :",
  erreur: "Le code s'est arrêté sur une erreur :",
  delai: `Arrêté : le code a dépassé ${String(DELAI_MS / 1000)} secondes. Une boucle sans fin ?`,
};

function AffichageResultat({ resultat }: { resultat: Resultat }) {
  const vide = resultat.sorties.length === 0;
  return (
    <>
      <p className={styles.statut}>{MESSAGES[resultat.statut]}</p>
      {vide ? (
        resultat.statut === "ok" && <p>Le code n&apos;a rien affiché.</p>
      ) : (
        <pre className={styles.console}>
          {resultat.sorties.map((sortie, index) => (
            <span key={index} className={classes(sortie.flux === "stderr" && styles.erreur)}>
              {sortie.texte}
            </span>
          ))}
        </pre>
      )}
      {resultat.tronque && <p>La sortie était trop longue : seul le début est affiché.</p>}
    </>
  );
}
