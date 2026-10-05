import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  ADMIN,
  afficherA,
  AVEC_ADMIN,
  AVEC_RELECTURE,
  simulerApi,
  UTILISATEURS,
} from "../../test/outils";

const KITSUNE = UTILISATEURS.utilisateurs[0];

describe("Accès", () => {
  it("est réservé aux admins", async () => {
    simulerApi(AVEC_RELECTURE);

    afficherA("/admin/utilisateurs");

    expect(await screen.findByText("Cette page est réservée aux administrateurs.")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Administration" })).toBeNull();
  });

  it("mène aux utilisateurs depuis le menu", async () => {
    simulerApi(AVEC_ADMIN);
    const utilisateur = userEvent.setup();
    const { router } = afficherA("/");

    await utilisateur.click(await screen.findByRole("link", { name: "Administration" }));

    expect(router.state.location.pathname).toBe("/admin/utilisateurs");
    expect(await screen.findByRole("heading", { level: 2, name: "Utilisateurs" })).toBeVisible();
  });
});

describe("Utilisateurs", () => {
  it("cherche par pseudo ou email", async () => {
    const requetes = simulerApi(AVEC_ADMIN);
    const utilisateur = userEvent.setup();
    const { router } = afficherA("/admin/utilisateurs");

    const recherche = await screen.findByRole("search", { name: "Utilisateurs" });
    await utilisateur.type(within(recherche).getByLabelText("Pseudo ou email"), "kit{Enter}");

    await waitFor(() => {
      expect(router.state.location.search).toBe("?q=kit");
    });
    expect(
      requetes.some((r) => r.cle === "GET /admin/utilisateurs?q=kit&limite=50&decalage=0"),
    ).toBe(true);
  });

  it("change le rôle et suspend un compte, mais pas le sien", async () => {
    const requetes = simulerApi({
      ...AVEC_ADMIN,
      [`PATCH /admin/utilisateurs/${KITSUNE?.id ?? ""}`]: () => ({ statut: 200, corps: KITSUNE }),
    });
    const utilisateur = userEvent.setup();
    afficherA("/admin/utilisateurs");

    const tableau = await screen.findByRole("table");
    const moi = within(tableau).getByRole("row", { name: new RegExp(ADMIN.pseudo) });
    expect(within(moi).getByText("C'est toi")).toBeVisible();
    expect(within(moi).queryByRole("button")).toBeNull();

    await utilisateur.click(within(tableau).getByRole("button", { name: "Modifier kitsune" }));
    const fenetre = await screen.findByRole("dialog", { name: "Modifier kitsune" });
    await utilisateur.selectOptions(within(fenetre).getByLabelText("Rôle"), "contributeur");
    await utilisateur.click(within(fenetre).getByRole("checkbox", { name: /Compte suspendu/ }));
    await utilisateur.click(within(fenetre).getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Modifications enregistrées pour kitsune.")).toHaveRole(
      "status",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    const envoi = requetes.find((r) => r.cle.startsWith("PATCH"));
    expect(envoi?.corps).toEqual({ role: "contributeur", suspendu: true });
    expect(envoi?.entetes.get("X-CSRF-Token")).toBe(ADMIN.jeton_csrf);
  });
});

describe("Thèmes", () => {
  it("crée un thème avec un identifiant déduit du nom", async () => {
    const requetes = simulerApi({
      ...AVEC_ADMIN,
      "POST /admin/themes": () => ({
        statut: 201,
        corps: { slug: "bases-de-donnees", nom: "Bases de données", nb_lecons: 0, nb_parcours: 0 },
      }),
    });
    const utilisateur = userEvent.setup();
    afficherA("/admin/themes");

    const section = await screen.findByRole("region", { name: "Nouveau thème" });
    await utilisateur.type(within(section).getByLabelText("Nom"), "Bases de données");
    expect(within(section).getByLabelText("Identifiant")).toHaveValue("bases-de-donnees");
    await utilisateur.click(within(section).getByRole("button", { name: "Créer le thème" }));

    expect(await screen.findByText("Thème « Bases de données » créé.")).toBeVisible();
    expect(requetes.find((r) => r.cle === "POST /admin/themes")?.corps).toEqual({
      nom: "Bases de données",
      slug: "bases-de-donnees",
    });
  });

  it("ne propose de supprimer qu'un thème inutilisé, après confirmation", async () => {
    const requetes = simulerApi({
      ...AVEC_ADMIN,
      "DELETE /admin/themes/sql": () => ({ statut: 204 }),
    });
    const utilisateur = userEvent.setup();
    afficherA("/admin/themes");

    const tableau = await screen.findByRole("table");
    expect(within(tableau).queryByRole("button", { name: "Supprimer Python" })).toBeNull();
    await utilisateur.click(within(tableau).getByRole("button", { name: "Supprimer SQL" }));
    const confirmation = await screen.findByRole("alertdialog");
    await utilisateur.click(within(confirmation).getByRole("button", { name: "Supprimer" }));

    expect(await screen.findByText("Thème « sql » supprimé.")).toBeVisible();
    expect(requetes.some((r) => r.cle === "DELETE /admin/themes/sql")).toBe(true);
  });
});

describe("Journal", () => {
  it("affiche les actions en clair et filtre par type", async () => {
    const requetes = simulerApi(AVEC_ADMIN);
    const utilisateur = userEvent.setup();
    const { router } = afficherA("/admin/journal");

    const ligne = await screen.findByRole("row", { name: /Changement de rôle/ });
    expect(within(ligne).getByText("kitsune")).toBeVisible();
    expect(within(ligne).getByText("Après : contributeur")).toBeVisible();

    await utilisateur.selectOptions(screen.getByLabelText("Type d'action"), "suspension");

    await waitFor(() => {
      expect(router.state.location.search).toBe("?action=suspension");
    });
    expect(requetes.some((r) => r.cle.startsWith("GET /admin/journal?action=suspension"))).toBe(
      true,
    );
  });
});
