import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Form } from "react-aria-components";

import { Alerte } from "../../composants/Alerte";
import { Bouton } from "../../composants/Bouton";
import { ChampTexte } from "../../composants/ChampTexte";
import dialogue from "../../composants/Confirmation.module.css";
import { Confirmation } from "../../composants/Confirmation";
import { Fenetre } from "../../composants/Fenetre";
import formulaire from "../../composants/Formulaire.module.css";
import { MOTIF_SLUG, versSlug } from "../contribution/slug";
import tableau from "../relecture/Relecture.module.css";
import styles from "./Admin.module.css";
import { adminApi, type ThemeAdmin } from "./api";
import { NavAdmin } from "./NavAdmin";

const CLE = ["admin", "themes"] as const;

/** Gestion des thèmes (cadrage § 5.8). Un thème utilisé ne peut pas être supprimé. */
export function PageThemes() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const { data: themes, error } = useQuery({ queryKey: CLE, queryFn: adminApi.themes });
  const rafraichir = (texte: string) => {
    setMessage(texte);
    // Les listes de thèmes du reste de l'application aussi.
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: CLE }),
      queryClient.invalidateQueries({ queryKey: ["themes"] }),
    ]);
  };
  const suppression = useMutation({
    mutationFn: adminApi.supprimerTheme,
    onSuccess: (_, slug) => rafraichir(`Thème « ${slug} » supprimé.`),
  });

  return (
    <>
      <title>Thèmes — Administration — Le Renard Étudiant</title>
      <h1>Administration</h1>
      <NavAdmin />
      <h2>Thèmes</h2>

      <p role="status">{message}</p>
      {error && <Alerte>{error.message}</Alerte>}
      {suppression.error && <Alerte>{suppression.error.message}</Alerte>}
      {!themes && !error && <p>Chargement…</p>}
      {themes && (
        <div className={tableau.defilement}>
          <table className={tableau.tableau}>
            <caption>Thèmes des leçons et des parcours</caption>
            <thead>
              <tr>
                <th scope="col">Nom</th>
                <th scope="col">Identifiant</th>
                <th scope="col">Leçons</th>
                <th scope="col">Parcours</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {themes.map((theme) => (
                <tr key={theme.slug}>
                  <th scope="row">{theme.nom}</th>
                  <td>{theme.slug}</td>
                  <td>{theme.nb_lecons}</td>
                  <td>{theme.nb_parcours}</td>
                  <td>
                    <div className={styles.actionsLigne}>
                      <Renommer theme={theme} surRenomme={rafraichir} />
                      {theme.nb_lecons + theme.nb_parcours === 0 && (
                        <Confirmation
                          declencheur="Supprimer"
                          labelDeclencheur={`Supprimer ${theme.nom}`}
                          titre={`Supprimer le thème « ${theme.nom} » ?`}
                          message="Il n'est utilisé par aucune leçon ni aucun parcours."
                          confirmer="Supprimer"
                          onConfirmer={() => {
                            suppression.mutate(theme.slug);
                          }}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NouveauTheme surCree={rafraichir} />
    </>
  );
}

function Renommer({
  theme,
  surRenomme,
}: {
  theme: ThemeAdmin;
  surRenomme: (message: string) => Promise<unknown>;
}) {
  const [nom, setNom] = useState(theme.nom);
  const renommage = useMutation({
    mutationFn: () => adminApi.renommerTheme(theme.slug, nom.trim()),
    onSuccess: (modifie) => surRenomme(`Thème renommé en « ${modifie.nom} ».`),
  });

  return (
    <Fenetre
      declencheur="Renommer"
      labelDeclencheur={`Renommer ${theme.nom}`}
      titre={`Renommer « ${theme.nom} »`}
    >
      {(fermer) => (
        <Form
          className={formulaire.formulaire}
          validationErrors={renommage.error?.champs}
          onSubmit={(evenement) => {
            evenement.preventDefault();
            renommage.mutate(undefined, { onSuccess: fermer });
          }}
        >
          {renommage.error && <Alerte>{renommage.error.message}</Alerte>}
          <ChampTexte
            label="Nom"
            name="nom"
            value={nom}
            onChange={setNom}
            aide="L'identifiant ne change pas : il sert dans les adresses."
            minLength={2}
            maxLength={100}
            isRequired
          />
          <div className={dialogue.actions}>
            <Bouton variante="secondaire" onPress={fermer}>
              Annuler
            </Bouton>
            <Bouton type="submit" isPending={renommage.isPending}>
              Enregistrer
            </Bouton>
          </div>
        </Form>
      )}
    </Fenetre>
  );
}

function NouveauTheme({ surCree }: { surCree: (message: string) => Promise<unknown> }) {
  const [nom, setNom] = useState("");
  const [slug, setSlug] = useState("");
  const [slugModifie, setSlugModifie] = useState(false);
  const slugAffiche = slugModifie ? slug : versSlug(nom);
  const creation = useMutation({
    mutationFn: adminApi.creerTheme,
    onSuccess: (theme) => {
      setNom("");
      setSlug("");
      setSlugModifie(false);
      return surCree(`Thème « ${theme.nom} » créé.`);
    },
  });

  return (
    <section aria-labelledby="titre-nouveau-theme" className={styles.carte}>
      <h2 id="titre-nouveau-theme">Nouveau thème</h2>
      {creation.error && <Alerte>{creation.error.message}</Alerte>}
      <Form
        className={formulaire.formulaire}
        validationErrors={
          creation.error?.statut === 409 ? { slug: creation.error.message } : creation.error?.champs
        }
        onSubmit={(evenement) => {
          evenement.preventDefault();
          creation.mutate({ nom: nom.trim(), slug: slugAffiche });
        }}
      >
        <ChampTexte
          label="Nom"
          name="nom"
          value={nom}
          onChange={setNom}
          minLength={2}
          maxLength={100}
          isRequired
        />
        <ChampTexte
          label="Identifiant"
          name="slug"
          value={slugAffiche}
          onChange={(valeur) => {
            setSlugModifie(true);
            setSlug(valeur);
          }}
          aide="Utilisé dans les adresses et les fichiers d'import. Il ne pourra plus changer."
          validate={(v) =>
            MOTIF_SLUG.test(v) ? null : "Minuscules, chiffres et tirets uniquement (ex. : sql)."
          }
          isRequired
        />
        <div className={formulaire.actions}>
          <Bouton type="submit" isPending={creation.isPending}>
            Créer le thème
          </Bouton>
        </div>
      </Form>
    </section>
  );
}
