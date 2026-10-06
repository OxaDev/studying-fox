import { expect, test } from "@playwright/test";

import { LECON, simulerLecons } from "./simulation";

// Les bibliothèques de PyPI (Django…) sont ajoutées au lock de Pyodide à l'installation (ADR 0028).
test("charge Django, une bibliothèque venue de PyPI, dans le navigateur", async ({ page }) => {
  test.slow();
  await simulerLecons(page);
  await page.goto(`./lecons/${LECON.slug}`);
  const bloc = page.getByRole("group", { name: "Exemple Python à essayer" });
  await bloc.getByRole("textbox", { name: "Code Python, modifiable" }).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  // Un sous-module : le worker doit reconnaître le paquet `django` derrière `django.utils`.
  await page.keyboard.insertText(
    "from django.utils.version import get_version\nprint(get_version()[0])",
  );
  await bloc.getByRole("button", { name: "Exécuter" }).click();

  await expect(bloc.locator("pre")).toHaveText("6", { timeout: 60_000 });
});
