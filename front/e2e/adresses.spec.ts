import { expect, test } from "@playwright/test";

import { simulerLecons } from "./simulation";

// Le routeur (basename « /app ») mène « Mon espace » à /app, sans barre finale (ADR 0020).
test("Mon espace se recharge sans erreur", async ({ page }) => {
  await simulerLecons(page);
  await page.goto("./lecons");
  await page.getByRole("link", { name: "Mon espace" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Bonjour aiko !" })).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Bonjour aiko !" })).toBeVisible();
});

test("/app renvoie vers /app/ en gardant les paramètres", async ({ page }) => {
  await simulerLecons(page);
  await page.goto("/app?origine=lien");

  await expect(page).toHaveURL(/\/app\/\?origine=lien$/);
  await expect(page.getByRole("heading", { level: 1, name: "Bonjour aiko !" })).toBeVisible();
});
