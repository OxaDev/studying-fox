import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Form } from "react-aria-components";
import { Link, useNavigate } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { Bouton } from "../../composants/Bouton";
import { ChampChoix } from "../../composants/ChampChoix";
import { ChampTexte } from "../../composants/ChampTexte";
import formulaire from "../../composants/Formulaire.module.css";
import { NIVEAUX } from "../lecons/api";
import { contributionApi } from "./api";
import { MOTIF_SLUG, versSlug } from "./slug";

type Niveau = keyof typeof NIVEAUX;

const THEME_PAR_DEFAUT = "python-bases";

export function PageNouvelleLecon() {
  const navigate = useNavigate();
  const { data: themes } = useQuery({ queryKey: ["themes"], queryFn: contributionApi.themes });
  const [titre, setTitre] = useState("");
  const [slug, setSlug] = useState("");
  const [slugModifie, setSlugModifie] = useState(false);
  const [themeChoisi, setTheme] = useState<string | null>(null);
  // Par défaut, les bases de Python ; sinon le premier thème proposé par l'API.
  const theme =
    themeChoisi ?? (themes?.find((t) => t.slug === THEME_PAR_DEFAUT) ?? themes?.[0])?.slug ?? "";
  const [niveau, setNiveau] = useState<Niveau>("debutant");
  const creation = useMutation({
    mutationFn: contributionApi.creer,
    onSuccess: (contribution) => {
      void navigate(`/contributions/${contribution.revision_id}`);
    },
  });
  const slugAffiche = slugModifie ? slug : versSlug(titre);

  return (
    <>
      <title>Nouvelle leçon — Le Renard Étudiant</title>
      <nav aria-label="Fil d'Ariane" className="ariane">
        <ol>
          <li>
            <Link to="/contributions">Mes contributions</Link>
          </li>
          <li aria-current="page">Nouvelle leçon</li>
        </ol>
      </nav>
      <h1>Nouvelle leçon</h1>
      <p>Commence par l&apos;essentiel : tu écriras le contenu juste après.</p>

      {creation.error && <Alerte>{creation.error.message}</Alerte>}
      <Form
        className={formulaire.formulaire}
        validationErrors={
          creation.error?.statut === 409 ? { slug: creation.error.message } : creation.error?.champs
        }
        onSubmit={(evenement) => {
          evenement.preventDefault();
          creation.mutate({ titre: titre.trim(), slug: slugAffiche, theme, niveau });
        }}
      >
        <p className={formulaire.mention}>Tous les champs sont obligatoires.</p>
        <ChampTexte
          name="titre"
          label="Titre"
          value={titre}
          onChange={setTitre}
          minLength={3}
          maxLength={100}
          validate={(v) => (v.trim().length < 3 ? "3 caractères minimum." : null)}
          isRequired
        />
        <ChampTexte
          name="slug"
          label="Identifiant"
          aide={`Utilisé dans l'adresse : /lecons/${slugAffiche || "…"}. Il ne pourra plus changer.`}
          value={slugAffiche}
          onChange={(valeur) => {
            setSlugModifie(true);
            setSlug(valeur);
          }}
          validate={(v) =>
            MOTIF_SLUG.test(v)
              ? null
              : "Minuscules, chiffres et tirets uniquement (ex. : les-boucles)."
          }
          isRequired
        />
        <ChampChoix
          label="Thème"
          name="theme"
          valeur={theme}
          onChange={setTheme}
          options={(themes ?? []).map((t) => ({
            valeur: t.slug,
            libelle: t.nom,
          }))}
        />
        <ChampChoix
          label="Niveau"
          name="niveau"
          valeur={niveau}
          onChange={(valeur) => {
            setNiveau(valeur as Niveau);
          }}
          options={Object.entries(NIVEAUX).map(([valeur, libelle]) => ({ valeur, libelle }))}
        />
        <div className={formulaire.actions}>
          <Bouton type="submit" isPending={creation.isPending}>
            Créer le brouillon
          </Bouton>
        </div>
      </Form>
    </>
  );
}
