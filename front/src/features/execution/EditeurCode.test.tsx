import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EditeurCode } from "./EditeurCode";

function afficher(valeur: string) {
  const onChange = vi.fn<(valeur: string) => void>();
  render(<EditeurCode valeur={valeur} langage="python" label="Code Python" onChange={onChange} />);
  return { editeur: screen.getByRole("textbox", { name: "Code Python" }), onChange };
}

describe("EditeurCode", () => {
  it("explique comment quitter l'éditeur au clavier", () => {
    const { editeur } = afficher("print(1)");

    expect(editeur).toHaveAccessibleDescription(
      "Tab indente ou valide une suggestion. Pour quitter l'éditeur : Échap, puis Tab.",
    );
  });

  it("indente avec Tab au lieu de quitter l'éditeur", async () => {
    const { editeur, onChange } = afficher("print(1)");
    const utilisateur = userEvent.setup();

    await utilisateur.click(editeur);
    await utilisateur.keyboard("{Tab}");

    expect(editeur).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("    print(1)");
  });

  it("désindente avec Maj+Tab", async () => {
    const { editeur, onChange } = afficher("    print(1)");
    const utilisateur = userEvent.setup();

    await utilisateur.click(editeur);
    await utilisateur.keyboard("{Shift>}{Tab}{/Shift}");

    expect(onChange).toHaveBeenLastCalledWith("print(1)");
  });

  it("exécute le code avec Maj+Entrée", async () => {
    const surExecution = vi.fn();
    const onChange = vi.fn<(valeur: string) => void>();
    render(
      <EditeurCode
        valeur="print(1)"
        langage="python"
        label="Code Python"
        onChange={onChange}
        surExecution={surExecution}
      />,
    );
    const editeur = screen.getByRole("textbox", { name: "Code Python" });
    const utilisateur = userEvent.setup();

    await utilisateur.click(editeur);
    await utilisateur.keyboard("{Shift>}{Enter}{/Shift}");

    expect(surExecution).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
    expect(editeur).toHaveAccessibleDescription(/Maj\+Entrée exécute le code\./);
  });

  it("va à la ligne avec Maj+Entrée quand il n'y a rien à exécuter", async () => {
    const { editeur, onChange } = afficher("print(1)");
    const utilisateur = userEvent.setup();

    await utilisateur.click(editeur);
    await utilisateur.keyboard("{Shift>}{Enter}{/Shift}");

    expect(onChange).toHaveBeenCalled();
    expect(editeur).not.toHaveAccessibleDescription(/Maj\+Entrée/);
  });
});
