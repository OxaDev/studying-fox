import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  afficherA,
  AVEC_LECON,
  CONNECTE,
  LECON,
  simulerApi,
  violationsAxe,
} from "../../test/outils";
import { ContexteExecuteur } from "../execution/contexte";
import type { Resultat } from "../execution/types";
import { Markdown } from "./Markdown";

function afficherMarkdown(contenu: string, resultat?: Resultat) {
  const executer = vi.fn(() =>
    Promise.resolve(resultat ?? { sorties: [], statut: "ok" as const, tronque: false }),
  );
  const rendu = render(
    <ContexteExecuteur.Provider value={{ executer }}>
      <Markdown contenu={contenu} />
    </ContexteExecuteur.Provider>,
  );
  return { ...rendu, executer };
}

describe("Rendu Markdown", () => {
  it("n'interprète jamais le HTML brut", () => {
    const { container } = afficherMarkdown(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">',
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("neutralise les liens javascript:", () => {
    afficherMarkdown("[clique](javascript:alert(1))");

    expect(screen.getByText("clique").getAttribute("href") ?? "").not.toContain("javascript");
  });

  it("transforme les titres de niveau 1 en niveau 2", () => {
    afficherMarkdown("# Titre");

    expect(screen.getByRole("heading", { level: 2, name: "Titre" })).toBeInTheDocument();
  });

  it("affiche les encadrés avec leur titre", () => {
    afficherMarkdown("> [!a_retenir]\n> Le `=` range une valeur.");

    expect(screen.getByText("À retenir")).toBeInTheDocument();
    expect(screen.queryByText(/\[!a_retenir\]/)).toBeNull();
  });

  it("laisse une citation normale telle quelle", () => {
    const { container } = afficherMarkdown("> Une citation.");

    expect(container.querySelector("blockquote")).toHaveTextContent("Une citation.");
  });

  it("n'ajoute pas de bouton aux blocs non exécutables", () => {
    afficherMarkdown("```python\nprint(1)\n```");

    expect(screen.getByText("print(1)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exécuter" })).toBeNull();
  });
});

describe("Bloc de code exécutable", () => {
  it("exécute le code et annonce le résultat", async () => {
    const utilisateur = userEvent.setup();
    const { executer } = afficherMarkdown('```python run\nprint("Bonjour !")\n```', {
      sorties: [{ flux: "stdout", texte: "Bonjour !\n" }],
      statut: "ok",
      tronque: false,
    });

    await utilisateur.click(screen.getByRole("button", { name: "Exécuter" }));

    expect(executer).toHaveBeenCalledWith("python", 'print("Bonjour !")', expect.anything());
    const zone = await screen.findByText("Résultat :");
    expect(zone.parentElement).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Bonjour !", { selector: "pre span" })).toBeInTheDocument();
  });

  it("affiche les erreurs", async () => {
    const utilisateur = userEvent.setup();
    afficherMarkdown("```javascript run\nx +\n```", {
      sorties: [{ flux: "stderr", texte: "SyntaxError: Unexpected end of input" }],
      statut: "erreur",
      tronque: false,
    });

    await utilisateur.click(screen.getByRole("button", { name: "Exécuter" }));

    expect(await screen.findByText("Le code s'est arrêté sur une erreur :")).toBeInTheDocument();
    expect(screen.getByText(/SyntaxError/)).toBeInTheDocument();
  });

  it("donne un nom accessible à l'éditeur", () => {
    afficherMarkdown("```python run\nprint(1)\n```");

    expect(screen.getByRole("textbox", { name: "Code Python, modifiable" })).toBeInTheDocument();
  });
});

describe("Exercice", () => {
  const EXERCICE = [
    "> [!exercice]",
    "> Affiche le **double** de `n`.",
    ">",
    "> ```python run",
    "> n = 21",
    "> ```",
    ">",
    "> ```python solution",
    "> n = 21",
    "> print(n * 2)",
    "> ```",
  ].join("\n");

  it("affiche la consigne et un code de départ à lancer", async () => {
    const utilisateur = userEvent.setup();
    const { executer } = afficherMarkdown(EXERCICE);

    const exercice = screen.getByRole("group", { name: "Exercice" });
    expect(within(exercice).getByText("double")).toHaveProperty("tagName", "STRONG");
    expect(within(exercice).getByRole("group", { name: "À toi de jouer" })).toBeInTheDocument();
    await utilisateur.click(within(exercice).getByRole("button", { name: "Exécuter" }));

    expect(executer).toHaveBeenCalledWith("python", "n = 21", expect.anything());
  });

  it("masque la solution jusqu'à ce qu'on la demande", async () => {
    const utilisateur = userEvent.setup();
    afficherMarkdown(EXERCICE);

    const bouton = screen.getByRole("button", { name: "Afficher la solution" });
    expect(bouton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/print\(n \* 2\)/)).not.toBeVisible();

    await utilisateur.click(bouton);

    expect(screen.getByRole("button", { name: "Masquer la solution" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText(/print\(n \* 2\)/)).toBeVisible();
    expect(screen.getByText("Solution (Python)")).toBeInTheDocument();
    // La solution se lit, mais ne se modifie pas et ne se lance pas.
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Exécuter" })).toHaveLength(1);

    await utilisateur.click(screen.getByRole("button", { name: "Masquer la solution" }));
    expect(screen.queryByText(/print\(n \* 2\)/)).not.toBeVisible();
  });

  it("respecte les règles d'accessibilité, solution affichée", async () => {
    const utilisateur = userEvent.setup();
    const { container } = afficherMarkdown(EXERCICE);
    await utilisateur.click(screen.getByRole("button", { name: "Afficher la solution" }));

    expect(await violationsAxe(container)).toEqual([]);
  });
});

describe("Page d'une leçon", () => {
  it("affiche le titre, les objectifs et les crédits", async () => {
    simulerApi(AVEC_LECON);

    afficherA(`/lecons/${LECON.slug}`);

    expect(await screen.findByRole("heading", { level: 1, name: LECON.titre })).toBeInTheDocument();
    expect(screen.getByText("Afficher un message avec print")).toBeInTheDocument();
    expect(screen.getByText(/rédigée avec l'aide d'une IA/)).toBeInTheDocument();
    expect(screen.getByText(/Auteurs : aiko, kitsune/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CC BY-SA 4.0" })).toBeInTheDocument();
  });

  it("indique une leçon introuvable", async () => {
    simulerApi({
      ...CONNECTE,
      "GET /lecons/inconnue": () => ({ statut: 404, corps: { detail: "Leçon introuvable." } }),
    });

    afficherA("/lecons/inconnue");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Leçon introuvable" }),
    ).toBeInTheDocument();
  });

  it("liste les leçons publiées", async () => {
    simulerApi(AVEC_LECON);

    afficherA("/lecons");

    expect(await screen.findByRole("link", { name: LECON.titre })).toHaveAttribute(
      "href",
      `/lecons/${LECON.slug}`,
    );
  });
});
