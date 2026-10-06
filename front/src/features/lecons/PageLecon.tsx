import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { Bouton } from "../../composants/Bouton";
import { classes } from "../../composants/classes";
import { LienBouton } from "../../composants/LienBouton";
import { BarreProgression } from "../../composants/Progression";
import { aLeRole } from "../comptes/roles";
import { useMoiConnecte } from "../comptes/session";
import { contributionApi } from "../contribution/api";
import { type ParcoursDetail, parcoursApi } from "../parcours/api";
import { leconsApi, NIVEAUX, type LeconPubliee } from "./api";
import { BoutonTerminee } from "./BoutonTerminee";
import { Markdown } from "./Markdown";
import styles from "./PageLecon.module.css";

/**
 * Page d'une leçon, seule (/lecons/:slug) ou dans un parcours (/parcours/:parcours/:lecon).
 * Dans un parcours, elle affiche aussi le sommaire, l'avancement et la leçon suivante.
 */
export function PageLecon() {
  const { slug, lecon: slugDansParcours, parcours: slugParcours } = useParams();
  const slugLecon = slugDansParcours ?? slug ?? "";
  const lecon = useQuery({
    queryKey: ["lecons", slugLecon],
    queryFn: () => leconsApi.lire(slugLecon),
  });
  const parcours = useQuery({
    queryKey: ["parcours", slugParcours],
    queryFn: () => parcoursApi.lire(slugParcours ?? ""),
    enabled: Boolean(slugParcours),
  });

  const erreur = lecon.error ?? parcours.error;
  if (erreur) {
    return (
      <>
        <title>Leçon introuvable — Le Renard Étudiant</title>
        <h1>{erreur.statut === 404 ? "Leçon introuvable" : "Impossible d'afficher la leçon"}</h1>
        {erreur.statut !== 404 && <Alerte>{erreur.message}</Alerte>}
        <p>
          <Link to="/lecons">Voir toutes les leçons</Link>
        </p>
      </>
    );
  }
  if (!lecon.data || (slugParcours && !parcours.data)) {
    return <p role="status">Chargement de la leçon…</p>;
  }
  return <Lecon lecon={lecon.data} parcours={parcours.data} />;
}

function Lecon({ lecon, parcours }: { lecon: LeconPubliee; parcours?: ParcoursDetail }) {
  const position = parcours?.lecons.findIndex((l) => l.slug === lecon.slug) ?? -1;
  const suivante = parcours?.lecons[position + 1];

  return (
    <>
      <title>{`${lecon.titre} — Le Renard Étudiant`}</title>
      <nav aria-label="Fil d'Ariane" className="ariane">
        <ol>
          {parcours ? (
            <>
              <li>
                <Link to="/parcours">Parcours</Link>
              </li>
              <li>
                <Link to={`/parcours/${parcours.slug}`}>{parcours.titre}</Link>
              </li>
            </>
          ) : (
            <li>
              <Link to="/lecons">Leçons</Link>
            </li>
          )}
          <li aria-current="page">{lecon.titre}</li>
        </ol>
      </nav>

      <div className={classes(styles.disposition, parcours && styles.avecSommaire)}>
        {parcours && <Sommaire parcours={parcours} actuelle={lecon.slug} />}

        <article className={styles.lecon}>
          <header>
            <p className={styles.etiquettes}>
              {position >= 0 && <span className={styles.badge}>Leçon {position + 1}</span>}
              <span>{lecon.theme.nom}</span>
              <span>{NIVEAUX[lecon.niveau]}</span>
              <span>{lecon.duree_minutes} min</span>
            </p>
            <h1>{lecon.titre}</h1>
            <p className={styles.resume}>{lecon.resume}</p>
          </header>

          <section aria-labelledby="au-programme" className={styles.programme}>
            <h2 id="au-programme">Au programme</h2>
            <ul>
              {lecon.objectifs.map((objectif) => (
                <li key={objectif}>{objectif}</li>
              ))}
            </ul>
          </section>

          <Markdown contenu={lecon.contenu} />

          <div className={styles.actions}>
            <BoutonTerminee slug={lecon.slug} terminee={lecon.terminee} />
            {parcours &&
              (suivante ? (
                <LienBouton to={`/parcours/${parcours.slug}/${suivante.slug}`}>
                  Leçon suivante : {suivante.titre} <span aria-hidden="true">→</span>
                </LienBouton>
              ) : (
                <LienBouton to={`/parcours/${parcours.slug}`} variante="secondaire">
                  Retour au parcours
                </LienBouton>
              ))}
          </div>

          <PropositionModification slug={lecon.slug} />

          <footer className={styles.credits}>
            {lecon.assiste_par_ia && (
              <p>
                Cette leçon a été rédigée avec l&apos;aide d&apos;une IA, puis relue par un humain.
              </p>
            )}
            <p>
              {lecon.auteurs.length > 1 ? "Auteurs" : "Auteur"} : {lecon.auteurs.join(", ")}.
              Contenu sous licence{" "}
              <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" hrefLang="fr">
                CC BY-SA 4.0
              </a>
              .
            </p>
          </footer>
        </article>
      </div>
    </>
  );
}

function Sommaire({ parcours, actuelle }: { parcours: ParcoursDetail; actuelle: string }) {
  return (
    <nav aria-label={`Sommaire du parcours ${parcours.titre}`} className={styles.sommaire}>
      <p className={styles.titreSommaire}>{parcours.titre}</p>
      <BarreProgression
        faites={parcours.nb_terminees}
        total={parcours.nb_lecons}
        label={`Avancement dans ${parcours.titre}`}
      />
      <ol>
        {parcours.lecons.map((etape) => (
          <li key={etape.slug} data-terminee={etape.terminee}>
            <Link
              to={`/parcours/${parcours.slug}/${etape.slug}`}
              aria-current={etape.slug === actuelle ? "page" : undefined}
            >
              {etape.titre}
              {etape.terminee && <span className="visuellement-cache"> (terminée)</span>}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Pour les contributeurs : ouvre une proposition de modification de cette leçon (ADR 0022). */
function PropositionModification({ slug }: { slug: string }) {
  const moi = useMoiConnecte();
  const navigate = useNavigate();
  const proposition = useMutation({
    mutationFn: () => contributionApi.proposerModification(slug),
    onSuccess: (contribution) => {
      void navigate(`/contributions/${contribution.revision_id}`);
    },
  });
  if (!aLeRole(moi.role, "contributeur")) return null;
  return (
    <div className={styles.suite}>
      <Bouton
        variante="secondaire"
        isPending={proposition.isPending}
        onPress={() => {
          proposition.mutate();
        }}
      >
        Proposer une modification
      </Bouton>
      {proposition.error && <Alerte>{proposition.error.message}</Alerte>}
    </div>
  );
}
