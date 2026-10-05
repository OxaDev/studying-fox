import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  afficherA,
  AVEC_ADMIN,
  AVEC_CONTRIBUTION,
  AVEC_LECON,
  AVEC_RECHERCHE,
  AVEC_RELECTURE,
  CONNECTE,
  CONTRIBUTION,
  LECON,
  NON_CONNECTE,
  PARCOURS,
  REVISION,
  simulerApi,
  violationsAxe,
} from "./test/outils";

describe("Mon espace", () => {
  it("salue l'utilisateur connecté", async () => {
    simulerApi(CONNECTE);

    afficherA("/");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Bonjour aiko !" }),
    ).toBeInTheDocument();
  });
});

describe("Page introuvable", () => {
  it("s'affiche pour une adresse inconnue", async () => {
    simulerApi(NON_CONNECTE);

    afficherA("/nimporte-quoi");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Page introuvable" }),
    ).toBeInTheDocument();
  });
});

describe("Accessibilité", () => {
  const pages = [
    { adresse: "/", titre: "Bonjour aiko !", api: AVEC_LECON },
    { adresse: "/profil", titre: "Mon profil", api: CONNECTE },
    { adresse: "/lecons", titre: "Toutes les leçons", api: AVEC_LECON },
    { adresse: `/lecons/${LECON.slug}`, titre: LECON.titre, api: AVEC_LECON },
    { adresse: "/parcours", titre: "Nos parcours", api: AVEC_LECON },
    { adresse: "/recherche?q=fonctions", titre: "Rechercher", api: AVEC_RECHERCHE },
    { adresse: `/parcours/${PARCOURS.slug}`, titre: PARCOURS.titre, api: AVEC_LECON },
    {
      adresse: `/parcours/${PARCOURS.slug}/${LECON.slug}`,
      titre: LECON.titre,
      api: AVEC_LECON,
    },
    { adresse: "/connexion", titre: "Connexion", api: NON_CONNECTE },
    { adresse: "/inscription", titre: "Créer un compte", api: NON_CONNECTE },
    { adresse: "/confirmation?jeton=abc", titre: "Confirmer mon adresse", api: NON_CONNECTE },
    { adresse: "/mot-de-passe-oublie", titre: "Mot de passe oublié", api: NON_CONNECTE },
    { adresse: "/reinitialisation?jeton=abc", titre: "Nouveau mot de passe", api: NON_CONNECTE },
    { adresse: "/nimporte-quoi", titre: "Page introuvable", api: NON_CONNECTE },
    { adresse: "/relecture", titre: "Relecture", api: AVEC_RELECTURE },
    { adresse: "/admin/utilisateurs", titre: "Administration", api: AVEC_ADMIN },
    { adresse: "/admin/themes", titre: "Administration", api: AVEC_ADMIN },
    { adresse: "/admin/journal", titre: "Administration", api: AVEC_ADMIN },
    { adresse: "/contributions", titre: "Mes contributions", api: AVEC_CONTRIBUTION },
    { adresse: "/contributions/nouvelle", titre: "Nouvelle leçon", api: AVEC_CONTRIBUTION },
    {
      adresse: `/contributions/${CONTRIBUTION.revision_id}`,
      titre: "Écrire « Les boucles »",
      api: AVEC_CONTRIBUTION,
    },
    { adresse: "/relecture/import", titre: "Importer des leçons", api: AVEC_RELECTURE },
    {
      adresse: `/relecture/${REVISION.revision_id}`,
      titre: `Relire « ${REVISION.titre} »`,
      api: AVEC_RELECTURE,
    },
  ];

  it.each(pages)("$adresse n'a aucune erreur détectée par axe", async ({ adresse, titre, api }) => {
    simulerApi(api);
    const { container } = afficherA(adresse);
    await screen.findByRole("heading", { level: 1, name: titre });

    expect(await violationsAxe(container)).toEqual([]);
  });
});
