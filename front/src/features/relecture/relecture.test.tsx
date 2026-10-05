import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  afficherA,
  ANALYSE,
  AVEC_LECON,
  AVEC_RELECTURE,
  LECON,
  REVISION,
  simulerApi,
} from "../../test/outils";
import type { Resultat } from "../execution/types";
import type { ElementFile } from "./api";
import { comparer } from "./verification";

const ok = (texte: string): Resultat => ({
  sorties: [{ flux: "stdout", texte }],
  statut: "ok",
  tronque: false,
});

describe("Comparaison des sorties", () => {
  it("ignore les retours à la ligne finaux", () => {
    expect(comparer(ok("Bonjour !"), "Bonjour !\n").etat).toBe("conforme");
  });

  it("signale une sortie différente", () => {
    expect(comparer(ok("Bonsoir"), "Bonjour")).toEqual({
      etat: "different",
      obtenu: "Bonsoir",
      attendu: "Bonjour",
    });
  });

  it("signale une erreur d'exécution", () => {
    const resultat: Resultat = {
      sorties: [{ flux: "stderr", texte: "NameError: x" }],
      statut: "erreur",
      tronque: false,
    };
    expect(comparer(resultat, null)).toEqual({ etat: "erreur", message: "NameError: x" });
  });

  it("accepte n'importe quelle sortie si rien n'est attendu", () => {
    expect(comparer(ok("42"), null).etat).toBe("conforme");
  });
});

describe("Accès à la relecture", () => {
  it("est refusé à un apprenant, et le menu ne la propose pas", async () => {
    simulerApi(AVEC_LECON);

    afficherA("/relecture");

    expect(await screen.findByRole("heading", { name: "Accès réservé" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Relecture" })).toBeNull();
  });

  it("montre la file à une relectrice", async () => {
    simulerApi(AVEC_RELECTURE);

    afficherA("/relecture");

    const tableau = await screen.findByRole("table");
    expect(within(tableau).getByRole("link", { name: REVISION.titre })).toHaveAttribute(
      "href",
      `/relecture/${REVISION.revision_id}`,
    );
    expect(within(tableau).getByText("exemple.json")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Relecture" })).toBeInTheDocument();
  });
});

describe("Publication groupée depuis la file", () => {
  it("publie les versions cochées après confirmation", async () => {
    const requetes = simulerApi({
      ...AVEC_RELECTURE,
      "POST /relecture/decisions": () => ({
        statut: 200,
        corps: { revision_ids: [REVISION.revision_id] },
      }),
    });
    const utilisateur = userEvent.setup();
    afficherA("/relecture");

    const publier = await screen.findByRole("button", { name: "Publier la sélection" });
    expect(publier).toBeDisabled();
    await utilisateur.click(screen.getByRole("checkbox", { name: "Tout sélectionner" }));
    expect(
      screen.getByRole("checkbox", { name: `Sélectionner « ${REVISION.titre} »` }),
    ).toBeChecked();
    await utilisateur.click(screen.getByRole("button", { name: "Publier 1 leçon" }));
    const dialogue = await screen.findByRole("alertdialog", { name: "Publier 1 leçon ?" });
    await utilisateur.click(within(dialogue).getByRole("button", { name: "Publier" }));

    expect(await screen.findByText("1 leçon publiée.")).toBeInTheDocument();
    const envoi = requetes.find((r) => r.cle === "POST /relecture/decisions");
    expect(envoi?.corps).toEqual({ decision: "publier", revision_ids: [REVISION.revision_id] });
    expect(envoi?.entetes.get("X-CSRF-Token")).toBe("jeton-csrf-de-test");
  });

  it("ne laisse pas cocher sa propre leçon", async () => {
    const mienne: ElementFile = {
      revision_id: REVISION.revision_id,
      lecon_slug: LECON.slug,
      titre: LECON.titre,
      numero: 1,
      statut: "en_relecture",
      auteur: "relectrice",
      assiste_par_ia: false,
      fichier_importe: null,
      cree_le: "2026-10-05T10:00:00Z",
      peut_publier: false,
    };
    simulerApi({ ...AVEC_RELECTURE, "GET /relecture": () => ({ statut: 200, corps: [mienne] }) });

    afficherA("/relecture");

    expect(
      await screen.findByRole("checkbox", { name: /tu l'as écrite, une autre personne/ }),
    ).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Tout sélectionner" })).toBeDisabled();
  });
});

describe("Import", () => {
  const fichier = new File(['{"format": "renard-etudiant/lecons"}'], "exemple.json", {
    type: "application/json",
  });

  async function analyser(api: Parameters<typeof simulerApi>[0], sortie: string) {
    const requetes = simulerApi(api);
    const executer = vi.fn(() => Promise.resolve(ok(sortie)));
    const utilisateur = userEvent.setup();
    afficherA("/relecture/import", { executer });
    await utilisateur.upload(await screen.findByLabelText("Fichier à importer"), fichier);
    await utilisateur.click(screen.getByRole("button", { name: "Analyser le fichier" }));
    return { requetes, executer, utilisateur };
  }

  it("vérifie le code puis importe", async () => {
    const { requetes, executer, utilisateur } = await analyser(
      {
        ...AVEC_RELECTURE,
        "POST /imports/analyse": () => ({ statut: 200, corps: ANALYSE }),
        "POST /imports": () => ({
          statut: 201,
          corps: { id: "i1", revisions: [{ slug: "x", revision_id: REVISION.revision_id }] },
        }),
      },
      "Bonjour !\n",
    );

    expect(
      await screen.findByText("Tous les exemples donnent le résultat attendu."),
    ).toBeInTheDocument();
    expect(executer).toHaveBeenCalledWith("python", 'print("Bonjour !")');
    await utilisateur.click(screen.getByRole("button", { name: "Importer 1 leçon en brouillon" }));

    expect(await screen.findByRole("heading", { name: "Import réussi" })).toBeInTheDocument();
    const envoi = requetes.find((r) => r.cle === "POST /imports");
    expect(envoi?.entetes.get("X-CSRF-Token")).toBe("jeton-csrf-de-test");
  });

  it("propose de publier les leçons importées, toutes cochées", async () => {
    const autre = "00000000-0000-0000-0000-0000000000bb";
    const { requetes, utilisateur } = await analyser(
      {
        ...AVEC_RELECTURE,
        "POST /imports/analyse": () => ({
          statut: 200,
          corps: {
            ...ANALYSE,
            lecons: [
              ...ANALYSE.lecons,
              { ...ANALYSE.lecons[0], slug: "les-boucles", titre: "Les boucles" },
            ],
            parcours: {
              slug: "bases",
              titre: "Les bases",
              action: "creation",
              lecons: [LECON.slug, "les-boucles"],
            },
          },
        }),
        "POST /imports": () => ({
          statut: 201,
          corps: {
            id: "i1",
            revisions: [
              { slug: "les-boucles", revision_id: autre },
              { slug: LECON.slug, revision_id: REVISION.revision_id },
            ],
          },
        }),
        "POST /relecture/decisions": () => ({
          statut: 200,
          corps: { revision_ids: [REVISION.revision_id] },
        }),
      },
      "Bonjour !\n",
    );
    await screen.findByText("Tous les exemples donnent le résultat attendu.");
    await utilisateur.click(screen.getByRole("button", { name: "Importer 2 leçons en brouillon" }));

    const groupe = await screen.findByRole("group", { name: "Publier maintenant" });
    expect(screen.getByText(/tu publies le parcours/)).toHaveTextContent("Les bases");
    const cases = within(groupe).getAllByRole("checkbox");
    // « Tout sélectionner », puis les leçons dans l'ordre du fichier.
    expect(cases[0]).toHaveAccessibleName("Tout sélectionner");
    expect(cases[1]).toHaveAccessibleName(LECON.titre);
    expect(cases[2]).toHaveAccessibleName("Les boucles");
    expect(cases.every((c) => (c as HTMLInputElement).checked)).toBe(true);

    await utilisateur.click(within(groupe).getByRole("checkbox", { name: "Les boucles" }));
    expect(
      within(groupe).getByRole("checkbox", { name: "Tout sélectionner" }),
    ).toBePartiallyChecked();
    await utilisateur.click(screen.getByRole("button", { name: "Publier 1 leçon" }));
    await utilisateur.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Publier" }),
    );

    expect(await screen.findByText("1 leçon publiée.")).toBeInTheDocument();
    expect(
      within(groupe).getByRole("checkbox", { name: `${LECON.titre} (publiée)` }),
    ).toBeDisabled();
    const envoi = requetes.find((r) => r.cle === "POST /relecture/decisions");
    expect(envoi?.corps).toEqual({ decision: "publier", revision_ids: [REVISION.revision_id] });
  });

  it("bloque l'import si un exemple ne donne pas le résultat attendu", async () => {
    await analyser(
      { ...AVEC_RELECTURE, "POST /imports/analyse": () => ({ statut: 200, corps: ANALYSE }) },
      "Bonsoir !\n",
    );

    expect(await screen.findByText("résultat différent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importer 1 leçon en brouillon" })).toBeDisabled();
  });

  it("liste les erreurs du fichier", async () => {
    await analyser(
      {
        ...AVEC_RELECTURE,
        "POST /imports/analyse": () => ({
          statut: 200,
          corps: {
            ...ANALYSE,
            valide: false,
            erreurs: [{ emplacement: "Leçon « x » › theme", message: "Thème inconnu." }],
          },
        }),
      },
      "",
    );

    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("Le fichier contient 1 erreur.");
    expect(alerte).toHaveTextContent("Leçon « x » › theme : Thème inconnu.");
    expect(screen.queryByRole("button", { name: /Importer/ })).toBeNull();
  });
});

describe("Relecture d'une version", () => {
  const adresse = `/relecture/${REVISION.revision_id}`;

  it("exige un commentaire pour refuser", async () => {
    const requetes = simulerApi(AVEC_RELECTURE);
    const utilisateur = userEvent.setup();
    afficherA(adresse);

    await utilisateur.click(await screen.findByRole("radio", { name: "Refuser" }));
    await utilisateur.click(screen.getByRole("button", { name: "Enregistrer la décision" }));

    expect(requetes.some((r) => r.cle.startsWith("POST /relecture"))).toBe(false);
    expect(screen.getByLabelText("Commentaire")).toBeInvalid();
  });

  it("publie la version", async () => {
    const requetes = simulerApi({
      ...AVEC_RELECTURE,
      [`POST /relecture/${REVISION.revision_id}/decision`]: () => ({
        statut: 200,
        corps: { ...REVISION, statut: "publiee", a_relire: false },
      }),
    });
    const utilisateur = userEvent.setup();
    afficherA(adresse);

    await utilisateur.click(await screen.findByRole("radio", { name: "Publier" }));
    await utilisateur.click(screen.getByRole("button", { name: "Enregistrer la décision" }));

    expect(
      await screen.findByText("Cette version n'attend plus de relecture (statut : Publiée)."),
    ).toBeInTheDocument();
    const envoi = requetes.find((r) => r.cle.endsWith("/decision"));
    expect(envoi?.corps).toEqual({ decision: "publier", commentaire: "" });
  });

  it("empêche de publier sa propre leçon", async () => {
    simulerApi({
      ...AVEC_RELECTURE,
      [`GET /relecture/${REVISION.revision_id}`]: () => ({
        statut: 200,
        corps: { ...REVISION, peut_publier: false, fichier_importe: null },
      }),
    });

    afficherA(adresse);

    expect(await screen.findByRole("radio", { name: "Publier" })).toBeDisabled();
    expect(screen.getByText(/une autre personne doit la publier/)).toBeInTheDocument();
  });

  it("affiche l'aperçu de la leçon", async () => {
    simulerApi(AVEC_RELECTURE);

    afficherA(adresse);

    const apercu = await screen.findByRole("region", { name: "Aperçu de la leçon" });
    expect(within(apercu).getByRole("button", { name: "Exécuter" })).toBeInTheDocument();
  });
});
