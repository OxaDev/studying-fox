import { expect, type Page, test } from "@playwright/test";

import { LECON, simulerLecons } from "./simulation";

type NomLangage = "Python" | "JavaScript" | "VBA";

function bloc(page: Page, langage: NomLangage) {
  return page.getByRole("group", { name: `Exemple ${langage} à essayer` });
}

async function remplacerCode(page: Page, langage: NomLangage, code: string) {
  const editeur = bloc(page, langage).getByRole("textbox", { name: `Code ${langage}, modifiable` });
  await editeur.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(code);
}

test.beforeEach(async ({ page }) => {
  await simulerLecons(page);
  await page.goto(`./lecons/${LECON.slug}`);
});

test("exécute du JavaScript", async ({ page }) => {
  await bloc(page, "JavaScript").getByRole("button", { name: "Exécuter" }).click();

  await expect(bloc(page, "JavaScript").locator("pre")).toHaveText("Bonjour depuis JavaScript");
});

test("exécute du Python avec Pyodide hébergé localement", async ({ page }) => {
  test.slow();
  await bloc(page, "Python").getByRole("button", { name: "Exécuter" }).click();

  await expect(bloc(page, "Python").locator("pre")).toHaveText("Bonjour Aiko !", {
    timeout: 60_000,
  });
});

test("montre une erreur Python lisible", async ({ page }) => {
  test.slow();
  await remplacerCode(page, "Python", "print(prenon)");
  await bloc(page, "Python").getByRole("button", { name: "Exécuter" }).click();

  const sortie = bloc(page, "Python").locator("pre");
  await expect(sortie).toContainText("NameError", { timeout: 60_000 });
  await expect(sortie).toContainText('File "<lecon>", line 1');
  await expect(sortie).not.toContainText("_pyodide");
});

test("exécute du VBA et affiche la feuille Excel", async ({ page }) => {
  const worker = page.waitForResponse(/\/worker-vba-/);
  await bloc(page, "VBA").getByRole("button", { name: "Exécuter" }).click();

  await expect(bloc(page, "VBA").locator("pre")).toHaveText("Bonjour depuis VBA");
  const feuille = bloc(page, "VBA").getByRole("table", { name: "Feuille « Feuil1 »" });
  await expect(feuille.getByRole("row", { name: "1 Total 12,5" })).toBeVisible();
  // Le worker VBA n'a droit à rien : ni eval, ni réseau (ADR 0026).
  expect((await worker).headers()["content-security-policy"]).toBe("default-src 'none'");
});

test("montre une erreur VBA avec sa ligne", async ({ page }) => {
  await remplacerCode(page, "VBA", "Sub Main()\nDim x As Integer\nx = 40000\nEnd Sub");
  await bloc(page, "VBA").getByRole("button", { name: "Exécuter" }).click();

  await expect(bloc(page, "VBA").locator("pre")).toHaveText(
    "Erreur d'exécution 6 (ligne 3) : Dépassement de capacité",
  );
});

test("Maj+Entrée exécute le code depuis l'éditeur", async ({ page }) => {
  await remplacerCode(page, "JavaScript", 'console.log("raccourci")');
  await page.keyboard.press("Shift+Enter");

  await expect(bloc(page, "JavaScript").locator("pre")).toHaveText("raccourci");
  await expect(
    bloc(page, "JavaScript").getByRole("textbox", { name: "Code JavaScript, modifiable" }),
  ).toHaveText('console.log("raccourci")');
});

test("le bouton Réinitialiser restaure le code d'origine", async ({ page }) => {
  await remplacerCode(page, "JavaScript", 'console.log("modifié")');
  await bloc(page, "JavaScript").getByRole("button", { name: "Réinitialiser" }).click();
  await bloc(page, "JavaScript").getByRole("button", { name: "Exécuter" }).click();

  await expect(bloc(page, "JavaScript").locator("pre")).toHaveText("Bonjour depuis JavaScript");
});

test("le code d'une leçon ne peut pas appeler l'API", async ({ page }) => {
  await remplacerCode(
    page,
    "JavaScript",
    'const r = await fetch("/api/comptes/moi"); console.log(await r.text());',
  );
  await bloc(page, "JavaScript").getByRole("button", { name: "Exécuter" }).click();

  const sortie = bloc(page, "JavaScript").locator("pre");
  await expect(sortie).toContainText("TypeError");
  await expect(sortie).not.toContainText("aiko");
});

test("une boucle infinie est arrêtée", async ({ page }) => {
  test.slow();
  await remplacerCode(page, "JavaScript", "while (true) {}");
  await bloc(page, "JavaScript").getByRole("button", { name: "Exécuter" }).click();

  await expect(bloc(page, "JavaScript")).toContainText("a dépassé 10 secondes", {
    timeout: 20_000,
  });

  // Le worker a été recréé : on peut relancer.
  await bloc(page, "JavaScript").getByRole("button", { name: "Réinitialiser" }).click();
  await bloc(page, "JavaScript").getByRole("button", { name: "Exécuter" }).click();
  await expect(bloc(page, "JavaScript").locator("pre")).toHaveText("Bonjour depuis JavaScript");
});

test.describe("clavier de l'éditeur, comme dans un IDE", () => {
  async function saisir(page: Page, texte: string) {
    await remplacerCode(page, "Python", "");
    await page.keyboard.type(texte);
    await expect(page.getByRole("listbox")).toBeVisible();
    // CodeMirror ignore les touches sur la liste juste après son ouverture (interactionDelay).
    await page.waitForTimeout(100);
  }

  function editeur(page: Page) {
    return bloc(page, "Python").getByRole("textbox", { name: "Code Python, modifiable" });
  }

  test("Tab valide la suggestion", async ({ page }) => {
    await saisir(page, "pri");
    await page.keyboard.press("Tab");

    await expect(editeur(page)).toHaveText("print");
    await expect(editeur(page)).toBeFocused();
  });

  test("les flèches parcourent les suggestions", async ({ page }) => {
    await saisir(page, "pr");
    await page.keyboard.press("ArrowDown");

    await expect(page.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(editeur(page).locator(".cm-line")).toHaveText(["pr"]);
  });

  test("Entrée va à la ligne sans valider la suggestion", async ({ page }) => {
    await saisir(page, "pri");
    await page.keyboard.press("Enter");

    await expect(editeur(page).locator(".cm-line")).toHaveText(["pri", ""]);
  });

  test("Tab indente, Échap puis Tab quitte l'éditeur", async ({ page }) => {
    await remplacerCode(page, "Python", "x = 1");
    await page.keyboard.press("Home");
    await page.keyboard.press("Tab");
    await expect(editeur(page)).toHaveText("    x = 1");
    await expect(editeur(page)).toBeFocused();

    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await expect(editeur(page)).not.toBeFocused();
  });
});
