import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import exemple from "../../../../../docs/format-lecon/exemple.json";
import { violationsAxe } from "../../../test/outils";
import { Markdown } from "../Markdown";
import { analyserSvg, svgComplet } from "./analyse";
import { cas } from "./cas-de-test.json";
import { Illustration } from "./Illustration";
import { illustrationsDuPaquet } from "./paquet";

const DEUX_CASES =
  '<svg viewBox="0 0 200 100" font-size="12">' +
  "<title>Deux cases</title><desc>Une case rouge, puis une case en dégradé.</desc>" +
  '<defs><linearGradient id="degrade"><stop offset="0" stop-color="ciel"/></linearGradient></defs>' +
  '<rect id="case" x="10" y="10" width="80" height="80" fill="illu-rouge" stroke-width="2"/>' +
  '<rect x="110" y="10" width="80" height="80" fill="url(#degrade)" stroke="none"/>' +
  '<use href="#case"/><text x="50" y="95">A</text></svg>';

describe("Contrôle d'une illustration (cas partagés avec l'API)", () => {
  it.each(cas)("$nom", ({ svg, erreur }) => {
    const analyse = analyserSvg(svg, new DOMParser());

    if (erreur === null) {
      expect(analyse).toMatchObject({ valide: true });
    } else {
      expect(analyse.valide).toBe(false);
      const erreurs = analyse.valide ? [] : analyse.erreurs;
      expect(erreurs.some((message) => message.includes(erreur))).toBe(true);
    }
  });

  it("refuse plus de 2000 éléments", () => {
    const svg = `<svg viewBox="0 0 1 1"><title>T</title><desc>D</desc>${"<g/>".repeat(2000)}</svg>`;

    expect(analyserSvg(svg, new DOMParser())).toEqual({
      valide: false,
      erreurs: ["Plus de 2000 éléments."],
    });
  });

  it("accepte l'illustration de l'exemple officiel, avec son titre et sa légende", () => {
    const [illustration, ...autres] = illustrationsDuPaquet(exemple);

    expect(autres).toEqual([]);
    expect(illustration).toMatchObject({
      emplacement: "les-variables-en-python › bloc 2",
      nom: "les-variables-en-python-bloc-2",
      legende: "Une variable : une boîte avec un nom, qui contient une valeur",
    });
    expect(analyserSvg(illustration?.svg ?? "", new DOMParser())).toMatchObject({
      valide: true,
      titre: 'La variable prenom vue comme une boîte qui contient "Aiko"',
    });
  });

  it("ajoute le titre et la description comme l'API", () => {
    expect(svgComplet('<svg viewBox="0 0 1 1"/>', "Un <carré>", "Le carré & son ombre.")).toBe(
      '<svg viewBox="0 0 1 1"><title>Un &lt;carré&gt;</title>' +
        "<desc>Le carré &amp; son ombre.</desc></svg>",
    );
    expect(svgComplet('<svg viewBox="0 0 1 1"><g/></svg>', "T", "D")).toBe(
      '<svg viewBox="0 0 1 1"><title>T</title><desc>D</desc><g/></svg>',
    );
  });
});

describe("Affichage d'une illustration", () => {
  it("donne le titre comme nom accessible, et la description à la demande", async () => {
    render(<Illustration source={DEUX_CASES} legende="Le plateau" />);

    expect(screen.getByRole("img", { name: "Deux cases" })).toBeInTheDocument();
    expect(screen.getByText("Le plateau").tagName).toBe("FIGCAPTION");
    const bouton = screen.getByRole("button", { name: "Description de l'illustration" });
    expect(bouton).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(bouton);

    expect(screen.getByText("Une case rouge, puis une case en dégradé.")).toBeVisible();
  });

  it("remplace les noms de couleur par les jetons du thème", () => {
    const { container } = render(<Illustration source={DEUX_CASES} />);
    const [rouge, degrade] = Array.from(container.querySelectorAll("rect"));

    expect(rouge?.style.fill).toBe("var(--illu-rouge)");
    expect(rouge).toHaveAttribute("stroke-width", "2");
    expect(container.querySelector("stop")?.style.stopColor).toBe("var(--ciel)");
    expect(degrade?.style.stroke).toBe("none");
    expect(degrade?.getAttribute("fill")).toBeNull();
  });

  it("préfixe les identifiants, pour que deux illustrations ne se mélangent pas", () => {
    const { container } = render(
      <>
        <Illustration source={DEUX_CASES} />
        <Illustration source={DEUX_CASES} />
      </>,
    );
    const degrades = Array.from(container.querySelectorAll("linearGradient")).map((d) => d.id);
    const [, cible] = Array.from(container.querySelectorAll("rect"));

    expect(new Set(degrades).size).toBe(2);
    expect(degrades[0]).toMatch(/^illustration-.+-degrade$/);
    expect(cible?.style.fill).toBe(`url(#${degrades[0] ?? ""})`);
    expect(container.querySelector("use")?.getAttribute("href")).toMatch(/^#illustration-.+-case$/);
  });

  it("garde les attributs du <svg> sur un groupe, sauf la taille", () => {
    const { container } = render(
      <Illustration source={DEUX_CASES.replace("<svg ", '<svg width="999" ')} />,
    );
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("viewBox", "0 0 200 100");
    expect(svg).not.toHaveAttribute("width");
    expect(svg?.querySelector(":scope > g")).toHaveAttribute("font-size", "12");
  });

  it("n'affiche rien d'une illustration refusée, et dit pourquoi", () => {
    const { container } = render(
      <Illustration source='<svg viewBox="0 0 1 1"><title>T</title><desc>D</desc><script>alert(1)</script></svg>' />,
    );

    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("Cette illustration ne peut pas s'afficher.")).toBeInTheDocument();
    expect(screen.getByText("Élément <script> non autorisé.")).toBeInTheDocument();
  });

  it("n'a aucune erreur détectée par axe", async () => {
    const { container } = render(<Illustration source={DEUX_CASES} legende="Le plateau" />);

    expect(await violationsAxe(container)).toEqual([]);
  });
});

describe("Illustration dans le Markdown d'une leçon", () => {
  it("lit le bloc ```illustration et sa légende", () => {
    render(<Markdown contenu={"```illustration Le plateau\n" + DEUX_CASES + "\n```\n"} />);

    expect(screen.getByRole("img", { name: "Deux cases" })).toBeInTheDocument();
    expect(screen.getByText("Le plateau")).toBeInTheDocument();
  });

  it("n'exécute pas un script caché dans l'illustration", () => {
    const { container } = render(
      <Markdown
        contenu={
          '```illustration\n<svg viewBox="0 0 1 1" onload="alert(1)"><title>T</title><desc>D</desc></svg>\n```\n'
        }
      />,
    );

    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("Attribut « onload » non autorisé sur <svg>.")).toBeInTheDocument();
  });
});
