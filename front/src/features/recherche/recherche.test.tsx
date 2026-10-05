import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { afficherA, AVEC_RECHERCHE, simulerApi } from "../../test/outils";

describe("Recherche", () => {
  it("est accessible depuis l'en-tête", async () => {
    simulerApi(AVEC_RECHERCHE);
    const utilisateur = userEvent.setup();
    const { router } = afficherA("/");

    await utilisateur.click(await screen.findByRole("link", { name: "Rechercher" }));

    expect(router.state.location.pathname).toBe("/recherche");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Rechercher" }),
    ).toBeInTheDocument();
  });

  it("cherche les mots saisis et surligne ceux trouvés", async () => {
    const requetes = simulerApi(AVEC_RECHERCHE);
    const utilisateur = userEvent.setup();
    const { router } = afficherA("/recherche");

    const formulaire = await screen.findByRole("search", { name: "Leçons et parcours" });
    await utilisateur.type(within(formulaire).getByLabelText("Mots-clés"), "fonctions{Enter}");

    await waitFor(() => {
      expect(router.state.location.search).toBe("?q=fonctions");
    });
    expect(requetes.some((r) => r.cle === "GET /recherche?q=fonctions")).toBe(true);
    expect(await screen.findByRole("status")).toHaveTextContent("2 résultats pour « fonctions »");
    await waitFor(() => {
      expect(document.title).toBe("Recherche « fonctions » — Le Renard Étudiant");
    });

    const lecons = screen.getByRole("region", { name: "Leçons (1)" });
    expect(within(lecons).getByRole("link", { name: "Les fonctions" })).toHaveAttribute(
      "href",
      "/lecons/les-fonctions",
    );
    expect(within(lecons).getByText("Terminée")).toBeInTheDocument();
    expect(within(lecons).getByText("fonction", { selector: "mark" })).toBeInTheDocument();
    const parcours = screen.getByRole("region", { name: "Parcours (1)" });
    expect(within(parcours).getByText("fonctions", { selector: "mark" })).toBeInTheDocument();
  });

  it("applique les filtres en gardant les mots saisis", async () => {
    const requetes = simulerApi(AVEC_RECHERCHE);
    const utilisateur = userEvent.setup();
    const { router } = afficherA("/recherche?q=boucle&type=lecon");

    expect(await screen.findByLabelText("Mots-clés")).toHaveValue("boucle");
    expect(screen.getByLabelText("Type")).toHaveValue("lecon");
    await screen.findByRole("option", { name: "JavaScript" });
    await utilisateur.selectOptions(screen.getByLabelText("Niveau"), "intermediaire");
    await utilisateur.selectOptions(screen.getByLabelText("Thème"), "javascript");

    await waitFor(() => {
      expect(router.state.location.search).toBe(
        "?q=boucle&type=lecon&theme=javascript&niveau=intermediaire",
      );
    });
    expect(
      requetes.some(
        (r) => r.cle === "GET /recherche?q=boucle&type=lecon&theme=javascript&niveau=intermediaire",
      ),
    ).toBe(true);
  });

  it("aide quand rien n'est trouvé", async () => {
    simulerApi({
      ...AVEC_RECHERCHE,
      "GET /recherche": () => ({ statut: 200, corps: { parcours: [], lecons: [] } }),
    });

    afficherA("/recherche?q=kubernetes");

    expect(await screen.findByText("Aucun résultat pour « kubernetes ».")).toHaveRole("status");
    expect(screen.getByText(/Vérifie l'orthographe/)).toBeInTheDocument();
    expect(screen.queryByRole("region")).toBeNull();
  });
});
