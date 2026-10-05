import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  FieldError,
  Form,
  Label,
  RadioButton,
  RadioField,
  RadioGroup,
  Text,
} from "react-aria-components";
import { Link, useParams } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { Bouton } from "../../composants/Bouton";
import { ChampTexte } from "../../composants/ChampTexte";
import formulaire from "../../composants/Formulaire.module.css";
import { lireFormulaire } from "../../composants/formulaire";
import { NIVEAUX } from "../lecons/api";
import { Markdown } from "../lecons/Markdown";
import { type Decision, DECISIONS, relectureApi, type RevisionARelire, STATUTS } from "./api";
import styles from "./Relecture.module.css";

const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/** Relecture d'une version : aperçu, historique et décision (ADR 0010). */
export function PageRevision() {
  const { revisionId = "" } = useParams();
  const { data: revision, error } = useQuery({
    queryKey: ["relecture", revisionId],
    queryFn: () => relectureApi.lire(revisionId),
  });

  if (error) {
    return (
      <>
        <title>Version introuvable — Le Renard Étudiant</title>
        <h1>{error.statut === 404 ? "Version introuvable" : "Impossible d'afficher la version"}</h1>
        {error.statut !== 404 && <Alerte>{error.message}</Alerte>}
        <p>
          <Link to="/relecture">Retour à la relecture</Link>
        </p>
      </>
    );
  }
  if (!revision) return <p role="status">Chargement de la version…</p>;
  return <Revision revision={revision} />;
}

function Revision({ revision }: { revision: RevisionARelire }) {
  return (
    <>
      <title>{`Relire « ${revision.titre} » — Le Renard Étudiant`}</title>
      <nav aria-label="Fil d'Ariane" className="ariane">
        <ol>
          <li>
            <Link to="/relecture">Relecture</Link>
          </li>
          <li aria-current="page">{revision.titre}</li>
        </ol>
      </nav>
      <h1>Relire « {revision.titre} »</h1>
      <ul className={styles.meta}>
        <li>Version {revision.numero}</li>
        <li>{STATUTS[revision.statut]}</li>
        <li>Auteur : {revision.auteur}</li>
        <li>
          {revision.fichier_importe
            ? `Importée (${revision.fichier_importe})`
            : "Rédigée sur le site"}
        </li>
        {revision.assiste_par_ia && <li>Rédigée avec l&apos;aide d&apos;une IA</li>}
      </ul>

      {revision.a_relire ? (
        <FormulaireDecision revision={revision} />
      ) : (
        <p>Cette version n&apos;attend plus de relecture (statut : {STATUTS[revision.statut]}).</p>
      )}

      <section className={styles.carte} aria-labelledby="titre-apercu">
        <h2 id="titre-apercu">Aperçu de la leçon</h2>
        <p>
          {revision.theme.nom} · {NIVEAUX[revision.niveau]} · {revision.duree_minutes} min
        </p>
        <p>{revision.resume}</p>
        <h3>Au programme</h3>
        <ul>
          {revision.objectifs.map((objectif) => (
            <li key={objectif}>{objectif}</li>
          ))}
        </ul>
        <Markdown contenu={revision.contenu} decalage={1} />
      </section>

      <section className={styles.carte} aria-labelledby="titre-historique">
        <h2 id="titre-historique">Historique de la leçon</h2>
        <ol className={styles.historique} reversed>
          {revision.historique.map((version) => (
            <li key={version.revision_id}>
              {version.revision_id === revision.revision_id ? (
                <strong>Version {version.numero} (celle-ci)</strong>
              ) : (
                <Link to={`/relecture/${version.revision_id}`}>Version {version.numero}</Link>
              )}{" "}
              : {STATUTS[version.statut]}
              {version.en_ligne && ", en ligne"}. Par {version.auteur}, le{" "}
              {date.format(new Date(version.cree_le))}.
              {version.decisions.length > 0 && (
                <ul>
                  {version.decisions.map((decision, index) => (
                    <li key={index}>
                      {DECISIONS[decision.decision]} par {decision.relecteur}, le{" "}
                      {date.format(new Date(decision.cree_le))}
                      {decision.commentaire && ` : « ${decision.commentaire} »`}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function FormulaireDecision({ revision }: { revision: RevisionARelire }) {
  const queryClient = useQueryClient();
  const [choix, setChoix] = useState<Decision | null>(null);
  const decision = useMutation({
    mutationFn: (corps: { decision: Decision; commentaire: string }) =>
      relectureApi.decider(revision.revision_id, corps),
    onSuccess: async (miseAJour) => {
      queryClient.setQueryData(["relecture", revision.revision_id], miseAJour);
      // La file seule (pas le détail, déjà à jour), puis tout ce que la publication change.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["relecture"], exact: true }),
        ...[["lecons"], ["parcours"], ["progression"]].map((cle) =>
          queryClient.invalidateQueries({ queryKey: cle }),
        ),
      ]);
    },
  });

  return (
    <section className={styles.carte} aria-labelledby="titre-decision">
      <h2 id="titre-decision">Ta décision</h2>
      {decision.isSuccess && <Alerte type="succes">Décision enregistrée.</Alerte>}
      {decision.error && <Alerte>{decision.error.message}</Alerte>}
      <Form
        className={formulaire.formulaire}
        validationErrors={decision.error?.champs}
        onSubmit={(evenement) => {
          const { commentaire = "" } = lireFormulaire(evenement);
          if (choix) decision.mutate({ decision: choix, commentaire });
        }}
      >
        <RadioGroup
          className={styles.choix}
          name="decision"
          value={choix}
          onChange={(valeur) => {
            setChoix(valeur as Decision);
          }}
          isRequired
          validate={(valeur) => (valeur ? null : "Choisis une décision.")}
        >
          <Label className={formulaire.label}>Décision</Label>
          {(Object.keys(DECISIONS) as Decision[]).map((cle) => (
            <RadioField
              key={cle}
              value={cle}
              isDisabled={cle === "publier" && !revision.peut_publier}
            >
              <RadioButton className={styles.option}>{DECISIONS[cle]}</RadioButton>
            </RadioField>
          ))}
          {!revision.peut_publier && (
            <Text slot="description" className={formulaire.aide}>
              Tu as écrit cette version : une autre personne doit la publier.
            </Text>
          )}
          <FieldError className={formulaire.erreur} />
        </RadioGroup>
        <ChampTexte
          name="commentaire"
          label="Commentaire"
          aide="Obligatoire pour demander des corrections ou refuser. L'auteur le lira."
          multiligne
          maxLength={2000}
          isRequired={choix !== null && choix !== "publier"}
        />
        <div className={formulaire.actions}>
          <Bouton type="submit" isPending={decision.isPending}>
            Enregistrer la décision
          </Bouton>
        </div>
      </Form>
    </section>
  );
}
