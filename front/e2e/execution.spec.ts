import { expect, type Page, test } from "@playwright/test";

import { LECON, simulerLecons } from "./simulation";

function bloc(page: Page, langage: "Python" | "JavaScript") {
  return page.getByRole("group", { name: `Exemple ${langage} à essayer` });
}

async function remplacerCode(page: Page, langage: "Python" | "JavaScript", code: string) {
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
