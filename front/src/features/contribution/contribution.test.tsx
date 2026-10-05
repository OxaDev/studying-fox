import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  afficherA,
  AVEC_CONTRIBUTION,
  AVEC_LECON,
  CONTRIBUTION,
  CONTRIBUTRICE,
  LECON,
  simulerApi,
} from "../../test/outils";
import { versSlug } from "./slug";

const adresse = `/contributions/${CONTRIBUTION.revision_id}`;

describe("Identifiant d'une leçon", () => {
  it("se déduit du titre", () => {
    expect(versSlug("  Les boucles « for » en Python ! ")).toBe("les-boucles-for-en-python");
    expect(versSlug("Élève à l'été")).toBe("eleve-a-l-ete");
  });
});

describe("Accès", () => {
  it("est réservé aux contributeurs", async () => {
    simulerApi(AVEC_LECON);

    afficherA("/contributions");

    expect(await screen.findByText(/réservée aux contributeurs/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Contribuer" })).toBeNull();
  });

  it("liste les contributions", async () => {
    simulerApi(AVEC_CONTRIBUTION);

    afficherA("/contributions");

    const tableau = await screen.findByRole("table");
    expect(within(tableau).getByRole("link", { name: "Les boucles" })).toHaveAttribute(
      "href",
      adresse,
    );
    expect(within(tableau).getByText("Nouvelle leçon")).toBeInTheDocument();
  });
});

describe("Nouvelle leçon", () => {
  it("propose un identifiant et crée le brouillon", async () => {
    const requetes = simulerApi({
      ...AVEC_CONTRIBUTION,
      "POST /contributions": () => ({ statut: 201, corps: CONTRIBUTION }),
    });
    const utilisateur = userEvent.setup();
    const { router } = afficherA("/contributions/nouvelle");

    await utilisateur.type(await screen.findByLabelText("Titre"), "Les boucles");
    expect(screen.getByLabelText("Identifiant")).toHaveValue("les-boucles");
    await utilisateur.selectOptions(screen.getByLabelText("Niveau"), "intermediaire");
    await utilisateur.click(screen.getByRole("button", { name: "Créer le brouillon" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(adresse);
    });
    expect(requetes.find((r) => r.cle === "POST /contributions")?.corps).toEqual({
      titre: "Les boucles",
      slug: "les-boucles",
      theme: "python",
      niveau: "intermediaire",
    });
  });

  it("signale un identifiant déjà pris", async () => {
    simulerApi({
      ...AVEC_CONTRIBUTION,
      "POST /contributions": () => ({
        statut: 409,
        corps: { detail: "Une leçon utilise déjà cet identifiant." },
      }),
    });
    const utilisateur = userEvent.setup();
    afficherA("/contributions/nouvelle");

    await utilisateur.type(await screen.findByLabelText("Titre"), "Les boucles");
    await utilisateur.click(screen.getByRole("button", { name: "Créer le brouillon" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("déjà cet identifiant");
    expect(screen.getByLabelText("Identifiant")).toBeInvalid();
  });
});

describe("Éditeur", () => {
  it("insère un bloc de code et l'affiche dans l'aperçu", async () => {
    simulerApi(AVEC_CONTRIBUTION);
    const utilisateur = userEvent.setup();
    afficherA(adresse);

    const outils = await screen.findByRole("toolbar", { name: "Insérer un bloc" });
    await utilisateur.click(within(outils).getByRole("button", { name: "Code Python exécutable" }));

    const apercu = await screen.findByRole("region", { name: "Aperçu" });
    expect(await within(apercu).findByRole("button", { name: "Exécuter" })).toBeInTheDocument();
    expect(screen.getByText(/Modifications non enregistrées/)).toBeInTheDocument();
  });

  it("enregistre le brouillon avec le jeton CSRF", async () => {
    const requetes = simulerApi({
      ...AVEC_CONTRIBUTION,
      [`PUT /contributions/${CONTRIBUTION.revision_id}`]: (requete) => ({
        statut: 200,
        corps: { ...CONTRIBUTION, ...(requete.corps as object) },
      }),
    });
    const utilisateur = userEvent.setup();
    afficherA(adresse);

    await utilisateur.type(await screen.findByLabelText("Résumé"), "Répéter une action.");
    await utilisateur.type(screen.getByLabelText("Objectifs"), "Écrire une boucle{Enter}{Enter}");
    await utilisateur.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));

    const envoi = await waitFor(() => {
      const trouve = requetes.find((r) => r.cle.startsWith("PUT"));
      expect(trouve).toBeDefined();
      return trouve;
    });
    expect(envoi?.entetes.get("X-CSRF-Token")).toBe(CONTRIBUTRICE.jeton_csrf);
    expect(envoi?.corps).toMatchObject({
      resume: "Répéter une action.",
      objectifs: ["Écrire une boucle"],
      duree_minutes: 10,
      theme: "python",
    });
  });

  it("n'autorise la soumission qu'une fois la licence acceptée", async () => {
    const requetes = simulerApi({
      ...AVEC_CONTRIBUTION,
      [`PUT /contributions/${CONTRIBUTION.revision_id}`]: () => ({
        statut: 200,
        corps: CONTRIBUTION,
      }),
      [`POST /contributions/${CONTRIBUTION.revision_id}/soumettre`]: () => ({
        statut: 200,
        corps: { ...CONTRIBUTION, statut: "en_relecture" },
      }),
    });
    const utilisateur = userEvent.setup();
    afficherA(adresse);

    const soumettre = await screen.findByRole("button", { name: "Soumettre à la relecture" });
    expect(soumettre).toBeDisabled();
    await utilisateur.click(screen.getByRole("checkbox", { name: /CC BY-SA 4.0/ }));
    await utilisateur.click(soumettre);

    expect(await screen.findByText(/Ta proposition est en relecture/)).toBeInTheDocument();
    expect(requetes.find((r) => r.cle.endsWith("/soumettre"))?.corps).toEqual({
      accepte_licence: true,
    });
  });

  it("affiche les champs incomplets renvoyés par l'API", async () => {
    simulerApi({
      ...AVEC_CONTRIBUTION,
      "GET /comptes/moi": () => ({
        statut: 200,
        corps: { ...CONTRIBUTRICE, licence_acceptee: true },
      }),
      [`PUT /contributions/${CONTRIBUTION.revision_id}`]: () => ({
        statut: 200,
        corps: CONTRIBUTION,
      }),
      [`POST /contributions/${CONTRIBUTION.revision_id}/soumettre`]: () => ({
        statut: 422,
        corps: {
          detail: [
            {
              loc: ["body", "resume"],
              msg: "Le résumé doit faire au moins 20 caractères.",
              type: "champ_incomplet",
            },
          ],
        },
      }),
    });
    const utilisateur = userEvent.setup();
    afficherA(adresse);

    await utilisateur.click(
      await screen.findByRole("button", { name: "Soumettre à la relecture" }),
    );

    expect(
      await screen.findByText("Le résumé doit faire au moins 20 caractères."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Résumé")).toBeInvalid();
  });
});

describe("Après la relecture", () => {
  it("montre le commentaire et permet de reprendre", async () => {
    const requetes = simulerApi({
      ...AVEC_CONTRIBUTION,
      [`GET /contributions/${CONTRIBUTION.revision_id}`]: () => ({
        statut: 200,
        corps: {
          ...CONTRIBUTION,
          statut: "a_corriger",
          retours: [
            {
              decision: "corriger",
              relecteur: "relectrice",
              commentaire: "Ajoute un exemple.",
              cree_le: "2026-10-05T11:00:00Z",
            },
          ],
        },
      }),
      [`POST /contributions/${CONTRIBUTION.revision_id}/reprendre`]: () => ({
        statut: 201,
        corps: { ...CONTRIBUTION, revision_id: "nouvelle", numero: 2 },
      }),
    });
    const utilisateur = userEvent.setup();
    const { router } = afficherA(adresse);

    expect(await screen.findByText(/« Ajoute un exemple. »/)).toBeInTheDocument();
    await utilisateur.click(screen.getByRole("button", { name: "Reprendre et corriger" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/contributions/nouvelle");
    });
    expect(requetes.some((r) => r.cle.endsWith("/reprendre"))).toBe(true);
  });
});

describe("Proposer une modification", () => {
  it("est proposé aux contributeurs sur la page d'une leçon", async () => {
    const requetes = simulerApi({
      ...AVEC_CONTRIBUTION,
      [`POST /contributions/depuis/${LECON.slug}`]: () => ({ statut: 200, corps: CONTRIBUTION }),
    });
    const utilisateur = userEvent.setup();
    const { router } = afficherA(`/lecons/${LECON.slug}`);

    await utilisateur.click(
      await screen.findByRole("button", { name: "Proposer une modification" }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(adresse);
    });
    expect(requetes.some((r) => r.cle === `POST /contributions/depuis/${LECON.slug}`)).toBe(true);
  });

  it("n'est pas proposé aux apprenants", async () => {
    simulerApi(AVEC_LECON);

    afficherA(`/lecons/${LECON.slug}`);

    await screen.findByRole("heading", { level: 1, name: LECON.titre });
    expect(screen.queryByRole("button", { name: "Proposer une modification" })).toBeNull();
  });
});
