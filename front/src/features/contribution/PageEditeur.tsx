import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EditorView } from "@codemirror/view";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Button, CheckboxButton, CheckboxField, Form, Toolbar } from "react-aria-components";
import { Link, useNavigate, useParams } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { Bouton } from "../../composants/Bouton";
import { ChampChoix } from "../../composants/ChampChoix";
import { ChampTexte } from "../../composants/ChampTexte";
import { Confirmation } from "../../composants/Confirmation";
import formulaire from "../../composants/Formulaire.module.css";
import { CLE_MOI, useMoiConnecte } from "../comptes/session";
import { EditeurCode } from "../execution/EditeurCode";
import { NIVEAUX } from "../lecons/api";
import { Markdown } from "../lecons/Markdown";
import { DECISIONS, STATUTS } from "../relecture/api";
import { type Contribution, contributionApi, type ContenuBrouillon } from "./api";
import styles from "./PageEditeur.module.css";

const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/** Blocs insérables au curseur (docs/markdown-lecons.md). */
const BLOCS = [
  { libelle: "Intertitre", texte: "\n## Intertitre\n\n" },
  { libelle: "Code Python exécutable", texte: '\n```python run\nprint("Bonjour !")\n```\n' },
  {
    libelle: "Code JavaScript exécutable",
    texte: '\n```javascript run\nconsole.log("Bonjour !");\n```\n',
  },
  {
    libelle: "Exercice Python",
    texte:
      '\n> [!exercice]\n> La consigne de l\'exercice.\n>\n> ```python run\n> # Code de départ\n> ```\n>\n> ```python solution\n> print("Solution")\n> ```\n',
  },
  { libelle: "Astuce", texte: "\n> [!astuce]\n> Ton astuce ici.\n" },
  { libelle: "Attention", texte: "\n> [!attention]\n> Le piège à éviter.\n" },
  { libelle: "À retenir", texte: "\n> [!a_retenir]\n> L'idée clé de la leçon.\n" },
];

/** Écrire ou modifier une leçon (cadrage § 5.5, ADR 0022). */
export function PageEditeur() {
  const { revisionId = "" } = useParams();
  const { data: contribution, error } = useQuery({
    queryKey: ["contributions", revisionId],
    queryFn: () => contributionApi.lire(revisionId),
  });

  if (error) {
    return (
      <>
        <title>Contribution introuvable — Le Renard Étudiant</title>
        <h1>
          {error.statut === 404
            ? "Contribution introuvable"
            : "Impossible d'afficher la contribution"}
        </h1>
        {error.statut !== 404 && <Alerte>{error.message}</Alerte>}
        <p>
          <Link to="/contributions">Retour à mes contributions</Link>
        </p>
      </>
    );
  }
  if (!contribution) return <p role="status">Chargement…</p>;
  return (
    <>
      <title>{`${contribution.titre || contribution.lecon_slug} — Mes contributions`}</title>
      <nav aria-label="Fil d'Ariane" className="ariane">
        <ol>
          <li>
            <Link to="/contributions">Mes contributions</Link>
          </li>
          <li aria-current="page">{contribution.titre || contribution.lecon_slug}</li>
        </ol>
      </nav>
      {contribution.statut === "brouillon" ? (
        <Editeur key={contribution.revision_id} contribution={contribution} />
      ) : (
        <VersionFigee contribution={contribution} />
      )}
    </>
  );
}

// --- Édition d'un brouillon ----------------------------------------------------------------

interface Champs {
  titre: string;
  resume: string;
  objectifs: string;
  duree: string;
  contenu: string;
  theme: string;
  niveau: ContenuBrouillon["niveau"];
}

function champsDepuis(c: Contribution): Champs {
  return {
    titre: c.titre,
    resume: c.resume,
    objectifs: c.objectifs.join("\n"),
    duree: String(c.duree_minutes),
    contenu: c.contenu,
    theme: c.theme.slug,
    niveau: c.niveau,
  };
}

function versApi(champs: Champs, nouvelleLecon: boolean): ContenuBrouillon {
  return {
    titre: champs.titre.trim(),
    resume: champs.resume.trim(),
    objectifs: champs.objectifs
      .split("\n")
      .map((o) => o.trim())
      .filter(Boolean),
    duree_minutes: Number(champs.duree) || 0,
    contenu: champs.contenu,
    ...(nouvelleLecon ? { theme: champs.theme, niveau: champs.niveau } : {}),
  };
}

function egaux(a: Champs, b: Champs): boolean {
  return (Object.keys(a) as (keyof Champs)[]).every((cle) => a[cle] === b[cle]);
}

function Editeur({ contribution }: { contribution: Contribution }) {
  const id = contribution.revision_id;
  const moi = useMoiConnecte();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const vue = useRef<EditorView | null>(null);
  const [champs, setChamps] = useState(() => champsDepuis(contribution));
  const [enregistres, setEnregistres] = useState(() => champsDepuis(contribution));
  const [licence, setLicence] = useState(false);
  const contenuAffiche = useDeferredValue(champs.contenu);
  const modifie = !egaux(champs, enregistres);
  const { data: themes } = useQuery({
    queryKey: ["themes"],
    queryFn: contributionApi.themes,
    enabled: contribution.nouvelle_lecon,
  });

  const changer = (cle: keyof Champs) => (valeur: string) => {
    setChamps((precedents) => ({ ...precedents, [cle]: valeur }));
  };

  async function enregistrerMaintenant(): Promise<Contribution> {
    const resultat = await contributionApi.enregistrer(
      id,
      versApi(champs, contribution.nouvelle_lecon),
    );
    setEnregistres(champsDepuis(resultat));
    return resultat;
  }

  const enregistrement = useMutation({
    mutationFn: enregistrerMaintenant,
    onSuccess: (resultat) => {
      queryClient.setQueryData(["contributions", id], resultat);
    },
  });
  const soumission = useMutation({
    mutationFn: async () => {
      await enregistrerMaintenant();
      return contributionApi.soumettre(id, licence);
    },
    onSuccess: async (resultat) => {
      queryClient.setQueryData(["contributions", id], resultat);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CLE_MOI }),
        queryClient.invalidateQueries({ queryKey: ["contributions"], exact: true }),
      ]);
    },
  });
  const suppression = useMutation({
    mutationFn: () => contributionApi.supprimer(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["contributions"], exact: true });
      void navigate("/contributions");
    },
  });

  // Prévient avant de quitter la page avec des modifications non enregistrées.
  useEffect(() => {
    if (!modifie) return;
    const prevenir = (evenement: BeforeUnloadEvent) => {
      evenement.preventDefault();
    };
    window.addEventListener("beforeunload", prevenir);
    return () => {
      window.removeEventListener("beforeunload", prevenir);
    };
  }, [modifie]);

  const erreur = soumission.error ?? enregistrement.error ?? suppression.error;
  const peutSoumettre = moi.licence_acceptee || licence;

  return (
    <>
      <h1>
        {contribution.nouvelle_lecon ? "Écrire" : "Modifier"} « {champs.titre || "Sans titre"} »
      </h1>
      <p className={styles.etat} aria-live="polite">
        Version {contribution.numero} ·{" "}
        {modifie
          ? "Modifications non enregistrées"
          : `Enregistré le ${date.format(new Date(contribution.modifiee_le))}`}
      </p>
      {erreur && <Alerte>{erreur.message}</Alerte>}

      <Form
        className={formulaire.formulaire}
        validationErrors={erreur?.champs}
        onSubmit={(evenement) => {
          evenement.preventDefault();
          enregistrement.mutate();
        }}
      >
        <section aria-labelledby="titre-infos" className={styles.carte}>
          <h2 id="titre-infos">Informations</h2>
          <div className={formulaire.formulaire}>
            <ChampTexte
              name="titre"
              label="Titre"
              value={champs.titre}
              onChange={changer("titre")}
              maxLength={100}
            />
            <ChampTexte
              name="resume"
              label="Résumé"
              aide="Une ou deux phrases, affichées dans le catalogue (20 à 300 caractères)."
              value={champs.resume}
              onChange={changer("resume")}
              maxLength={300}
              multiligne
            />
            <ChampTexte
              name="objectifs"
              label="Objectifs"
              aide="Un objectif par ligne (5 au maximum), qui commence par un verbe : « Écrire une boucle »."
              value={champs.objectifs}
              onChange={changer("objectifs")}
              multiligne
            />
            <ChampTexte
              name="duree_minutes"
              label="Durée en minutes"
              type="number"
              inputMode="numeric"
              value={champs.duree}
              onChange={changer("duree")}
              validate={(v) => {
                const minutes = Number(v);
                return minutes >= 2 && minutes <= 30 ? null : "Entre 2 et 30 minutes.";
              }}
            />
            {contribution.nouvelle_lecon && (
              <div className={styles.ligne}>
                <ChampChoix
                  label="Thème"
                  name="theme"
                  valeur={champs.theme}
                  onChange={changer("theme")}
                  options={(themes ?? [contribution.theme]).map((t) => ({
                    valeur: t.slug,
                    libelle: t.nom,
                  }))}
                />
                <ChampChoix
                  label="Niveau"
                  name="niveau"
                  valeur={champs.niveau ?? "debutant"}
                  onChange={changer("niveau")}
                  options={Object.entries(NIVEAUX).map(([valeur, libelle]) => ({
                    valeur,
                    libelle,
                  }))}
                />
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="titre-contenu" className={styles.carte}>
          <h2 id="titre-contenu">Contenu</h2>
          <details className={styles.aide}>
            <summary>Aide : la syntaxe Markdown</summary>
            <ul>
              <li>
                <code>**gras**</code>, <code>*italique*</code>, <code>`code`</code>
              </li>
              <li>
                <code>## Intertitre</code> (le titre de la leçon est déjà affiché)
              </li>
              <li>
                <code>- élément</code> pour une liste
              </li>
              <li>
                Un bloc <code>```python run</code> devient un exemple que l&apos;apprenant peut
                lancer.
              </li>
              <li>
                <code>&gt; [!astuce]</code>, <code>&gt; [!attention]</code> ou{" "}
                <code>&gt; [!a_retenir]</code> au début d&apos;une citation crée un encadré.
              </li>
              <li>
                <code>&gt; [!exercice]</code> crée un exercice : la consigne, un bloc{" "}
                <code>```python run</code> de départ, puis un bloc <code>```python solution</code>,
                masqué jusqu&apos;à ce que l&apos;apprenant le demande.
              </li>
            </ul>
          </details>
          <Toolbar aria-label="Insérer un bloc" className={styles.outils}>
            {BLOCS.map((bloc) => (
              <Button
                key={bloc.libelle}
                className={styles.outil}
                onPress={() => {
                  const editeur = vue.current;
                  if (!editeur) return;
                  editeur.dispatch(editeur.state.replaceSelection(bloc.texte));
                  editeur.focus();
                }}
              >
                {bloc.libelle}
              </Button>
            ))}
          </Toolbar>
          <div className={styles.edition}>
            <div className={styles.saisie}>
              <EditeurCode
                langage="markdown"
                label="Contenu de la leçon, en Markdown"
                valeur={champs.contenu}
                onChange={changer("contenu")}
                surVue={(editeur) => {
                  vue.current = editeur;
                }}
              />
              {erreur?.champs.contenu && (
                <p className={formulaire.erreur}>{erreur.champs.contenu}</p>
              )}
            </div>
            <section aria-labelledby="titre-apercu" className={styles.apercu}>
              <h3 id="titre-apercu">Aperçu</h3>
              {contenuAffiche.trim() ? (
                <Markdown contenu={contenuAffiche} decalage={2} />
              ) : (
                <p>L&apos;aperçu apparaîtra ici dès que tu écriras.</p>
              )}
            </section>
          </div>
        </section>

        <section aria-labelledby="titre-actions" className={styles.carte}>
          <h2 id="titre-actions">Enregistrer ou soumettre</h2>
          {moi.licence_acceptee ? (
            <p>Ta leçon sera publiée sous licence CC BY-SA 4.0, comme toutes les leçons du site.</p>
          ) : (
            <CheckboxField isSelected={licence} onChange={setLicence}>
              <CheckboxButton className={styles.case}>
                <span className={styles.boite} aria-hidden="true">
                  {licence ? "✓" : ""}
                </span>
                <span>
                  J&apos;accepte que mes contributions soient publiées sous licence{" "}
                  <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" hrefLang="fr">
                    CC BY-SA 4.0
                  </a>
                  .
                </span>
              </CheckboxButton>
            </CheckboxField>
          )}
          <div className={formulaire.actions}>
            <Bouton type="submit" variante="secondaire" isPending={enregistrement.isPending}>
              Enregistrer le brouillon
            </Bouton>
            <Bouton
              isDisabled={!peutSoumettre}
              isPending={soumission.isPending}
              onPress={() => {
                soumission.mutate();
              }}
            >
              Soumettre à la relecture
            </Bouton>
            <Confirmation
              declencheur="Supprimer le brouillon"
              titre="Supprimer ce brouillon ?"
              message="Le brouillon sera supprimé définitivement."
              confirmer="Supprimer"
              onConfirmer={() => {
                suppression.mutate();
              }}
            />
          </div>
          {!peutSoumettre && (
            <p className={formulaire.aide}>Accepte la licence pour pouvoir soumettre.</p>
          )}
        </section>
      </Form>
    </>
  );
}

// --- Version soumise, relue ou publiée -----------------------------------------------------

function VersionFigee({ contribution }: { contribution: Contribution }) {
  const navigate = useNavigate();
  const reprise = useMutation({
    mutationFn: () => contributionApi.reprendre(contribution.revision_id),
    onSuccess: (nouvelle) => {
      void navigate(`/contributions/${nouvelle.revision_id}`);
    },
  });

  return (
    <>
      <h1>« {contribution.titre} »</h1>
      <p className={styles.etat}>
        Version {contribution.numero} · {STATUTS[contribution.statut]}
      </p>

      {contribution.statut === "en_relecture" && (
        <Alerte type="succes">
          Ta proposition est en relecture. Reviens plus tard pour découvrir la décision.
        </Alerte>
      )}
      {contribution.statut === "publiee" && (
        <Alerte type="succes">
          <p>Bravo, cette version est publiée !</p>
          <p>
            <Link to={`/lecons/${contribution.lecon_slug}`}>Voir la leçon</Link>
          </p>
        </Alerte>
      )}

      {contribution.retours.length > 0 && (
        <section aria-labelledby="titre-retours" className={styles.carte}>
          <h2 id="titre-retours">Retours de relecture</h2>
          <ul>
            {contribution.retours.map((retour, index) => (
              <li key={index}>
                {DECISIONS[retour.decision]} par {retour.relecteur}, le{" "}
                {date.format(new Date(retour.cree_le))}
                {retour.commentaire && ` : « ${retour.commentaire} »`}
              </li>
            ))}
          </ul>
          {contribution.statut === "a_corriger" && (
            <>
              {reprise.error && <Alerte>{reprise.error.message}</Alerte>}
              <Bouton
                isPending={reprise.isPending}
                onPress={() => {
                  reprise.mutate();
                }}
              >
                Reprendre et corriger
              </Bouton>
            </>
          )}
        </section>
      )}

      <section aria-labelledby="titre-version" className={styles.carte}>
        <h2 id="titre-version">Contenu de cette version</h2>
        <p>{contribution.resume}</p>
        <Markdown contenu={contribution.contenu} decalage={1} />
      </section>
    </>
  );
}
