import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { afficherA, AVEC_LECON, ESPACE, LECON, MOI, PARCOURS, simulerApi } from "../../test/outils";

describe("Mon espace", () => {
  it("affiche l'avancement global et les parcours en cours", async () => {
    simulerApi(AVEC_LECON);

    afficherA("/");

    const avancement = await screen.findByRole("progressbar", { name: "Avancement global" });
    expect(avancement).toHaveAttribute("aria-valuenow", "33");
    expect(screen.getByText("1 parcours en cours")).toBeInTheDocument();
    expect(screen.getByText("1 leçon terminée")).toBeInTheDocument();
    const enCours = screen.getByRole("region", { name: "Mes parcours en cours" });
    expect(within(enCours).getByRole("link", { name: PARCOURS.titre })).toBeInTheDocument();
  });

  it("invite à commencer un parcours quand rien n'est commencé", async () => {
    simulerApi({
      ...AVEC_LECON,
      "GET /progression": () => ({
        statut: 200,
        corps: { ...ESPACE, lecons_terminees: 0, pourcentage: 0, parcours_en_cours: [] },
      }),
    });

    afficherA("/");

    expect(await screen.findByText("Tu n'as pas encore commencé de parcours.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Découvrir les parcours" })).toHaveAttribute(
      "href",
      "/parcours",
    );
  });
});

describe("Liste des parcours", () => {
  it("filtre par thème", async () => {
    simulerApi(AVEC_LECON);
    const utilisateur = userEvent.setup();
    afficherA("/parcours");

    expect(await screen.findByRole("link", { name: "Découvrir JavaScript" })).toBeInTheDocument();
    await utilisateur.click(screen.getByRole("link", { name: "Python" }));

    expect(screen.getByRole("link", { name: "Python" })).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("link", { name: "Découvrir JavaScript" })).toBeNull();
    expect(screen.getByRole("link", { name: PARCOURS.titre })).toBeInTheDocument();
  });
});

describe("Page d'un parcours", () => {
  it("propose de continuer à la première leçon non terminée", async () => {
    simulerApi(AVEC_LECON);

    afficherA(`/parcours/${PARCOURS.slug}`);

    expect(await screen.findByRole("link", { name: "Continuer le parcours" })).toHaveAttribute(
      "href",
      `/parcours/${PARCOURS.slug}/${LECON.slug}`,
    );
    const lecons = within(screen.getByRole("region", { name: "Les leçons du parcours" }));
    expect(lecons.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("terminée")).toBeInTheDocument();
  });

  it("indique un parcours introuvable", async () => {
    simulerApi({
      ...AVEC_LECON,
      "GET /parcours/inconnu": () => ({ statut: 404, corps: { detail: "Parcours introuvable." } }),
    });

    afficherA("/parcours/inconnu");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Parcours introuvable" }),
    ).toBeInTheDocument();
  });
});

describe("Leçon dans un parcours", () => {
  it("affiche le sommaire, le numéro de la leçon et la leçon suivante", async () => {
    simulerApi(AVEC_LECON);

    afficherA(`/parcours/${PARCOURS.slug}/${LECON.slug}`);

    const sommaire = await screen.findByRole("navigation", {
      name: `Sommaire du parcours ${PARCOURS.titre}`,
    });
    expect(within(sommaire).getByRole("link", { name: LECON.titre })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Leçon 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Leçon suivante : Les variables" })).toHaveAttribute(
      "href",
      `/parcours/${PARCOURS.slug}/variables`,
    );
  });

  it("marque la leçon comme terminée avec le jeton CSRF", async () => {
    const requetes = simulerApi({
      ...AVEC_LECON,
      [`PUT /progression/lecons/${LECON.slug}`]: () => ({ statut: 204 }),
    });
    const utilisateur = userEvent.setup();
    afficherA(`/parcours/${PARCOURS.slug}/${LECON.slug}`);

    const bouton = await screen.findByRole("button", { name: "Leçon terminée" });
    expect(bouton).toHaveAttribute("aria-pressed", "false");
    await utilisateur.click(bouton);

    const envoi = requetes.find((r) => r.cle === `PUT /progression/lecons/${LECON.slug}`);
    expect(envoi?.entetes.get("X-CSRF-Token")).toBe(MOI.jeton_csrf);
  });

  it("annule une leçon déjà terminée", async () => {
    const requetes = simulerApi({
      ...AVEC_LECON,
      [`GET /lecons/${LECON.slug}`]: () => ({ statut: 200, corps: { ...LECON, terminee: true } }),
      [`DELETE /progression/lecons/${LECON.slug}`]: () => ({ statut: 204 }),
    });
    const utilisateur = userEvent.setup();
    afficherA(`/lecons/${LECON.slug}`);

    const bouton = await screen.findByRole("button", { name: "Leçon terminée" });
    expect(bouton).toHaveAttribute("aria-pressed", "true");
    await utilisateur.click(bouton);

    expect(requetes.some((r) => r.cle === `DELETE /progression/lecons/${LECON.slug}`)).toBe(true);
  });
});
