import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { Bouton } from "../../composants/Bouton";
import { CaseACocher } from "../../composants/CaseACocher";
import formulaire from "../../composants/Formulaire.module.css";
import { LienBouton } from "../../composants/LienBouton";
import { useExecuteur } from "../execution/contexte";
import { LANGAGES } from "../execution/types";
import { relectureApi, type ResultatAnalyse, type ResultatImport } from "./api";
import {
  CaseToutSelectionner,
  libelleLecons,
  PublierLaSelection,
  useSelection,
} from "./PublicationGroupee";
import styles from "./Relecture.module.css";
import { type EtatVerification, verifierCodes } from "./verification";

type Verification = "aucune" | "en_cours" | "reussie" | "echouee";

/**
 * Import d'un paquet de leçons (ADR 0019) : analyse par l'API, puis vérification
 * des exemples de code dans ce navigateur (ADR 0009). C'est tout ou rien.
 */
export function PageImport() {
  const executeur = useExecuteur();
  const queryClient = useQueryClient();
  const idFichier = useId();
  const [fichier, setFichier] = useState<File | null>(null);
  const [etats, setEtats] = useState<EtatVerification[]>([]);
  const [verification, setVerification] = useState<Verification>("aucune");

  const analyse = useMutation({
    mutationFn: relectureApi.analyser,
    onSuccess: async (resultat) => {
      setEtats(resultat.codes.map(() => ({ etat: "en_attente" })));
      if (!resultat.valide) return;
      setVerification("en_cours");
      const reussie = await verifierCodes(executeur, resultat.codes, (index, etat) => {
        setEtats((precedents) => precedents.map((e, i) => (i === index ? etat : e)));
      });
      setVerification(reussie ? "reussie" : "echouee");
    },
  });
  const envoi = useMutation({
    mutationFn: relectureApi.importer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["relecture"] }),
  });

  function choisir(nouveau: File | null) {
    setFichier(nouveau);
    setEtats([]);
    setVerification("aucune");
    analyse.reset();
    envoi.reset();
  }

  if (envoi.isSuccess && analyse.data) {
    return (
      <ImportReussi
        resultat={envoi.data}
        analyse={analyse.data}
        recommencer={() => {
          choisir(null);
        }}
      />
    );
  }

  return (
    <>
      <title>Importer des leçons — Le Renard Étudiant</title>
      <nav aria-label="Fil d'Ariane" className="ariane">
        <ol>
          <li>
            <Link to="/relecture">Relecture</Link>
          </li>
          <li aria-current="page">Importer des leçons</li>
        </ol>
      </nav>
      <h1>Importer des leçons</h1>
      <p>
        Un fichier <code>.json</code>, ou une archive <code>.zip</code> avec ses images, au format
        décrit dans <code>docs/format-lecon</code>. Rien n&apos;est publié : chaque leçon devient un
        brouillon à relire.
      </p>

      <form
        className={styles.carte}
        onSubmit={(evenement) => {
          evenement.preventDefault();
          if (fichier) analyse.mutate(fichier);
        }}
      >
        <h2>1. Choisir le fichier</h2>
        <div className={formulaire.champ}>
          <label htmlFor={idFichier} className={formulaire.label}>
            Fichier à importer
          </label>
          <input
            id={idFichier}
            type="file"
            accept=".json,.zip,application/json,application/zip"
            aria-describedby={`${idFichier}-aide`}
            onChange={(evenement) => {
              choisir(evenement.target.files?.[0] ?? null);
            }}
          />
          <span id={`${idFichier}-aide`} className={formulaire.aide}>
            Obligatoire. Le bouton s&apos;active une fois le fichier choisi.
          </span>
        </div>
        <div className={formulaire.actions}>
          <Bouton type="submit" isDisabled={!fichier} isPending={analyse.isPending}>
            Analyser le fichier
          </Bouton>
        </div>
        {analyse.error && <Alerte>{analyse.error.message}</Alerte>}
      </form>

      {analyse.data && (
        <ResultatDeLAnalyse
          analyse={analyse.data}
          etats={etats}
          verification={verification}
          surImport={() => {
            if (fichier) envoi.mutate(fichier);
          }}
          importEnCours={envoi.isPending}
          erreurImport={envoi.error?.message}
        />
      )}
    </>
  );
}

interface PropsImportReussi {
  resultat: ResultatImport;
  analyse: ResultatAnalyse;
  recommencer: () => void;
}

/**
 * Après l'import, les leçons sont des brouillons (ADR 0019). On peut les publier ici en une
 * fois : toutes cochées, le parcours du fichier est publié en entier.
 */
function ImportReussi({ resultat, analyse, recommencer }: PropsImportReussi) {
  const idTitre = useId();
  const [publiees, setPubliees] = useState<ReadonlySet<string>>(new Set());
  // Dans l'ordre du fichier, qui est celui du parcours.
  const ordre = analyse.lecons.map((lecon) => lecon.slug);
  const titres = new Map(analyse.lecons.map((lecon) => [lecon.slug, lecon.titre]));
  const elements = [...resultat.revisions]
    .sort((a, b) => ordre.indexOf(a.slug) - ordre.indexOf(b.slug))
    .map((revision) => ({
      ...revision,
      titre: titres.get(revision.slug) ?? revision.slug,
      peut_publier: !publiees.has(revision.revision_id),
    }));
  const selection = useSelection(elements, "tout");
  const nombre = elements.length;

  return (
    <>
      <title>Import réussi — Le Renard Étudiant</title>
      <h1>Import réussi</h1>
      <Alerte type="succes">
        {libelleLecons(nombre)} importée{nombre > 1 ? "s" : ""} en brouillon.
      </Alerte>

      <section className={styles.carte} aria-labelledby={idTitre}>
        <h2 id={idTitre}>Publier maintenant</h2>
        <p>
          Tu as relu ces leçons ? Coche celles à publier. Les autres t&apos;attendent dans la file
          de relecture.
        </p>
        {analyse.parcours && (
          <p>
            Toutes cochées, tu publies le parcours <strong>{analyse.parcours.titre}</strong> en
            entier.
          </p>
        )}
        <div role="group" aria-labelledby={idTitre} className={styles.selection}>
          <CaseToutSelectionner selection={selection} />
          <ul className={styles.cases}>
            {elements.map((element) => (
              <li key={element.revision_id}>
                <CaseACocher
                  isSelected={selection.estChoisi(element.revision_id)}
                  isDisabled={!element.peut_publier}
                  onChange={(coche) => {
                    selection.basculer(element.revision_id, coche);
                  }}
                >
                  {element.titre}
                  {publiees.has(element.revision_id) && " (publiée)"}
                </CaseACocher>{" "}
                <Link to={`/relecture/${element.revision_id}`}>Relire « {element.titre} »</Link>
              </li>
            ))}
          </ul>
        </div>
        <PublierLaSelection
          ids={selection.ids}
          onPubliees={(ids) => {
            setPubliees((precedentes) => new Set([...precedentes, ...ids]));
          }}
        />
      </section>

      <div className={formulaire.actions}>
        <LienBouton to="/relecture">Aller à la relecture</LienBouton>
        <Bouton variante="secondaire" onPress={recommencer}>
          Importer un autre fichier
        </Bouton>
      </div>
    </>
  );
}

interface PropsResultat {
  analyse: ResultatAnalyse;
  etats: EtatVerification[];
  verification: Verification;
  surImport: () => void;
  importEnCours: boolean;
  erreurImport: string | undefined;
}

function ResultatDeLAnalyse({
  analyse,
  etats,
  verification,
  surImport,
  importEnCours,
  erreurImport,
}: PropsResultat) {
  const nombre = analyse.lecons.length;
  return (
    <>
      <section className={styles.carte} aria-labelledby="titre-analyse">
        <h2 id="titre-analyse">2. Contenu du fichier</h2>
        {analyse.valide ? (
          <>
            <ul>
              {analyse.lecons.map((lecon) => (
                <li key={lecon.slug}>
                  <strong>{lecon.titre}</strong> ({lecon.slug}) :{" "}
                  {lecon.action === "creation" ? "nouvelle leçon" : "nouvelle version"}
                  {lecon.nb_images > 0 && `, ${String(lecon.nb_images)} image(s)`}
                </li>
              ))}
            </ul>
            {analyse.parcours && (
              <p>
                Parcours <strong>{analyse.parcours.titre}</strong> :{" "}
                {analyse.parcours.action === "creation" ? "création" : "mise à jour"},{" "}
                {analyse.parcours.lecons.length} leçon(s).
              </p>
            )}
            {analyse.assiste_par_ia && (
              <p>
                Rédigé avec l&apos;aide d&apos;une IA{analyse.outil ? ` (${analyse.outil})` : ""} :
                les leçons porteront cette mention.
              </p>
            )}
          </>
        ) : (
          <Alerte>
            <p>
              Le fichier contient {analyse.erreurs.length} erreur
              {analyse.erreurs.length > 1 ? "s" : ""}. Corrige-le, puis relance l&apos;analyse.
            </p>
            <ul className={styles.erreurs}>
              {analyse.erreurs.map((erreur, index) => (
                <li key={index}>
                  <strong>{erreur.emplacement}</strong> : {erreur.message}
                </li>
              ))}
            </ul>
          </Alerte>
        )}
      </section>

      {analyse.valide && (
        <section className={styles.carte} aria-labelledby="titre-code">
          <h2 id="titre-code">3. Vérification des exemples de code</h2>
          <p aria-live="polite">{bilan(verification, etats, analyse.codes.length)}</p>
          {analyse.codes.length > 0 && (
            <ul className={styles.verifications}>
              {analyse.codes.map((code, index) => (
                <li key={`${code.lecon}-${String(code.bloc)}`} className={styles.verification}>
                  Leçon « {code.lecon} », bloc {code.bloc}
                  {code.solution && ", solution de l'exercice"} ({LANGAGES[code.langage]}) :{" "}
                  <DetailVerification etat={etats[index]} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {analyse.valide && (
        <section className={styles.carte} aria-labelledby="titre-import">
          <h2 id="titre-import">4. Importer</h2>
          {verification === "echouee" && (
            <p>Tous les exemples doivent donner le résultat attendu : rien n&apos;est importé.</p>
          )}
          <Bouton
            isDisabled={verification !== "reussie"}
            isPending={importEnCours}
            onPress={surImport}
          >
            Importer {nombre} leçon{nombre > 1 ? "s" : ""} en brouillon
          </Bouton>
          {erreurImport && <Alerte>{erreurImport}</Alerte>}
        </section>
      )}
    </>
  );
}

function bilan(verification: Verification, etats: EtatVerification[], total: number): string {
  const faits = etats.filter((e) => e.etat !== "en_attente" && e.etat !== "en_cours").length;
  switch (verification) {
    case "en_cours":
      return `Vérification en cours : ${String(faits)} sur ${String(total)}…`;
    case "reussie":
      return total === 0
        ? "Aucun exemple de code à vérifier."
        : "Tous les exemples donnent le résultat attendu.";
    case "echouee": {
      const echecs = etats.filter((e) => e.etat === "different" || e.etat === "erreur").length;
      return `${String(echecs)} exemple(s) ne donnent pas le résultat attendu.`;
    }
    case "aucune":
      return "";
  }
}

function DetailVerification({ etat }: { etat: EtatVerification | undefined }) {
  switch (etat?.etat) {
    case undefined:
    case "en_attente":
      return <span className={styles.etat}>en attente</span>;
    case "en_cours":
      return <span className={styles.etat}>en cours…</span>;
    case "conforme":
      return (
        <span className={styles.etat} data-etat="conforme">
          conforme
        </span>
      );
    case "different":
      return (
        <>
          <span className={styles.etat} data-etat="different">
            résultat différent
          </span>
          <pre className={styles.sortie}>
            Attendu :{"\n"}
            {etat.attendu}
            {"\n"}Obtenu :{"\n"}
            {etat.obtenu || "(rien)"}
          </pre>
        </>
      );
    case "erreur":
      return (
        <>
          <span className={styles.etat} data-etat="erreur">
            erreur
          </span>
          <pre className={styles.sortie}>{etat.message}</pre>
        </>
      );
  }
}
