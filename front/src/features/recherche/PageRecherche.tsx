import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Form } from "react-aria-components";
import { Link, useSearchParams } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { Bouton } from "../../composants/Bouton";
import { ChampChoix } from "../../composants/ChampChoix";
import { ChampTexte } from "../../composants/ChampTexte";
import formulaire from "../../composants/Formulaire.module.css";
import { contributionApi } from "../contribution/api";
import { NIVEAUX } from "../lecons/api";
import { CarteParcours } from "../parcours/CarteParcours";
import { type Criteres, type Resultats, rechercheApi, texteBrut } from "./api";
import styles from "./PageRecherche.module.css";
import { TexteSurligne } from "./TexteSurligne";

const TYPES = { "": "Tout", parcours: "Parcours", lecon: "Leçons" } as const;

function lireCriteres(parametres: URLSearchParams): Criteres {
  const type = parametres.get("type");
  const niveau = parametres.get("niveau");
  return {
    q: parametres.get("q") ?? "",
    type: type === "lecon" || type === "parcours" ? type : "",
    theme: parametres.get("theme") ?? "",
    niveau: niveau === "debutant" || niveau === "intermediaire" ? niveau : "",
  };
}

function pluriel(nombre: number, mot: string) {
  return `${String(nombre)} ${mot}${nombre > 1 ? "s" : ""}`;
}

function annonce(resultats: Resultats, q: string) {
  const total = resultats.lecons.length + resultats.parcours.length;
  const pour = q ? ` pour « ${q} »` : "";
  if (total === 0) {
    return `Aucun résultat${pour}.`;
  }
  return `${pluriel(total, "résultat")}${pour}.`;
}

/** Recherche dans les leçons et les parcours (cadrage § 5.4). Les critères sont dans l'adresse. */
export function PageRecherche() {
  const [parametres, setParametres] = useSearchParams();
  const criteres = lireCriteres(parametres);
  const [saisie, setSaisie] = useState(criteres.q);
  // Retour arrière du navigateur : le champ reprend les mots de l'adresse.
  const [qAffiche, setQAffiche] = useState(criteres.q);
  if (qAffiche !== criteres.q) {
    setQAffiche(criteres.q);
    setSaisie(criteres.q);
  }
  const { data: themes } = useQuery({ queryKey: ["themes"], queryFn: contributionApi.themes });
  const { data: resultats, error } = useQuery({
    queryKey: ["recherche", criteres],
    queryFn: () => rechercheApi.chercher(criteres),
    // Garde les résultats précédents à l'écran pendant le chargement des suivants.
    placeholderData: keepPreviousData,
  });

  function chercher(changements: Partial<Criteres>) {
    const nouveaux = { ...criteres, q: saisie.trim(), ...changements };
    setParametres(
      new URLSearchParams(Object.entries(nouveaux).filter(([, valeur]) => valeur !== "")),
    );
  }

  return (
    <>
      <title>
        {criteres.q
          ? `Recherche « ${criteres.q} » — Le Renard Étudiant`
          : "Recherche — Le Renard Étudiant"}
      </title>
      <h1>Rechercher</h1>

      <Form
        role="search"
        aria-label="Leçons et parcours"
        className={styles.formulaire}
        onSubmit={(evenement) => {
          evenement.preventDefault();
          chercher({});
        }}
      >
        <div className={formulaire.ligne}>
          <ChampTexte
            label="Mots-clés"
            name="q"
            type="search"
            value={saisie}
            onChange={setSaisie}
            maxLength={200}
            aide="Par exemple : boucle, fonction, variable."
          />
          <Bouton type="submit">Rechercher</Bouton>
        </div>
        <div className={styles.filtres}>
          <ChampChoix
            label="Type"
            name="type"
            valeur={criteres.type}
            onChange={(type) => {
              chercher({ type: type === "lecon" || type === "parcours" ? type : "" });
            }}
            options={Object.entries(TYPES).map(([valeur, libelle]) => ({ valeur, libelle }))}
          />
          <ChampChoix
            label="Thème"
            name="theme"
            valeur={criteres.theme}
            onChange={(theme) => {
              chercher({ theme });
            }}
            options={[
              { valeur: "", libelle: "Tous" },
              ...(themes ?? []).map((t) => ({ valeur: t.slug, libelle: t.nom })),
            ]}
          />
          <ChampChoix
            label="Niveau"
            name="niveau"
            valeur={criteres.niveau}
            onChange={(niveau) => {
              chercher({
                niveau: niveau === "debutant" || niveau === "intermediaire" ? niveau : "",
              });
            }}
            options={[
              { valeur: "", libelle: "Tous" },
              ...Object.entries(NIVEAUX).map(([valeur, libelle]) => ({ valeur, libelle })),
            ]}
          />
        </div>
      </Form>

      {error && <Alerte>{error.message}</Alerte>}
      {/* Toujours présent : les lecteurs d'écran annoncent ses changements. */}
      <p role="status" className={styles.annonce}>
        {resultats ? annonce(resultats, criteres.q) : !error && "Recherche en cours…"}
      </p>
      {resultats && resultats.lecons.length + resultats.parcours.length === 0 && (
        <p>
          Vérifie l&apos;orthographe, essaie un mot plus général ou retire un filtre. Tu peux aussi
          parcourir <Link to="/parcours">tous les parcours</Link>.
        </p>
      )}

      {resultats && resultats.parcours.length > 0 && (
        <section aria-labelledby="titre-parcours" className={styles.section}>
          <h2 id="titre-parcours">Parcours ({resultats.parcours.length})</h2>
          <ul className={styles.grille}>
            {resultats.parcours.map((p, index) => (
              <li key={p.slug}>
                <CarteParcours
                  parcours={{ ...p, description: texteBrut(p.description) }}
                  index={index}
                  niveauTitre={3}
                  avecDescription
                  description={<TexteSurligne segments={p.description} />}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {resultats && resultats.lecons.length > 0 && (
        <section aria-labelledby="titre-lecons" className={styles.section}>
          <h2 id="titre-lecons">Leçons ({resultats.lecons.length})</h2>
          <ul className={styles.liste}>
            {resultats.lecons.map((lecon) => (
              <li key={lecon.slug} className={styles.lecon}>
                <h3 className={styles.titre}>
                  <Link to={`/lecons/${lecon.slug}`}>{lecon.titre}</Link>
                </h3>
                <p className={styles.meta}>
                  {lecon.theme.nom} · {NIVEAUX[lecon.niveau]} · {lecon.duree_minutes} min
                  {lecon.terminee && (
                    <>
                      {" · "}
                      <span className={styles.terminee}>Terminée</span>
                    </>
                  )}
                </p>
                <p>
                  <TexteSurligne segments={lecon.resume} />
                </p>
                {lecon.extrait.length > 0 && (
                  <p className={styles.extrait}>
                    <span className="visuellement-cache">Extrait : </span>…
                    <TexteSurligne segments={lecon.extrait} />…
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
