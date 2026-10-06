import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import {
  CONTRIBUTION,
  LECON,
  PARCOURS,
  simulerAdmin,
  simulerContribution,
  simulerLecons,
  simulerSession,
} from "./simulation";

// Chaque page ajoutée à l'application doit être ajoutée ici (ADR 0013).
const PAGES_PUBLIQUES = [
  "connexion",
  "inscription",
  "confirmation?jeton=abc",
  "mot-de-passe-oublie",
  "reinitialisation?jeton=abc",
  "page-inexistante",
];
const PAGES_CONNECTEES = [
  "",
  "profil",
  "lecons",
  `lecons/${LECON.slug}`,
  "parcours",
  `parcours/${PARCOURS.slug}`,
  `parcours/${PARCOURS.slug}/${LECON.slug}`,
  "recherche?q=briques",
];

async function verifierAccessibilite(page: Page) {
  await expect(page.locator("h1")).toBeVisible();
  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(resultat.violations).toEqual([]);
}

for (const adresse of PAGES_PUBLIQUES) {
  test(`/app/${adresse} respecte les règles WCAG 2.1 AA`, async ({ page }) => {
    await simulerSession(page, false);
    await page.goto(`./${adresse}`);
    await verifierAccessibilite(page);
  });
}

for (const adresse of PAGES_CONNECTEES) {
  test(`/app/${adresse} (connecté) respecte les règles WCAG 2.1 AA`, async ({ page }) => {
    await simulerLecons(page);
    await page.goto(`./${adresse}`);
    await verifierAccessibilite(page);
  });
}

const PAGES_CONTRIBUTION = [
  "contributions",
  "contributions/nouvelle",
  `contributions/${CONTRIBUTION.revision_id}`,
];

for (const adresse of PAGES_CONTRIBUTION) {
  test(`/app/${adresse} (contributrice) respecte les règles WCAG 2.1 AA`, async ({ page }) => {
    await simulerContribution(page);
    await page.goto(`./${adresse}`);
    await verifierAccessibilite(page);
  });
}

for (const adresse of ["admin/utilisateurs", "admin/themes", "admin/journal"]) {
  test(`/app/${adresse} (admin) respecte les règles WCAG 2.1 AA`, async ({ page }) => {
    await simulerAdmin(page);
    await page.goto(`./${adresse}`);
    await verifierAccessibilite(page);
  });
}

test("la fenêtre de modification d'un utilisateur est accessible", async ({ page }) => {
  await simulerAdmin(page);
  await page.goto("./admin/utilisateurs");
  await page.getByRole("button", { name: "Modifier kitsune" }).click();

  const fenetre = page.getByRole("dialog", { name: "Modifier kitsune" });
  // Le focus entre dans la fenêtre et y reste piégé.
  await expect(fenetre).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(fenetre.getByLabel("Rôle")).toBeFocused();
  await verifierAccessibilite(page);
  await page.keyboard.press("Escape");
  await expect(fenetre).toBeHidden();
  await expect(page.getByRole("button", { name: "Modifier kitsune" })).toBeFocused();
});

test("le lien d'évitement mène au contenu", async ({ page }) => {
  await simulerSession(page, false);
  await page.goto("./connexion");
  await page.keyboard.press("Tab");

  const lien = page.getByRole("link", { name: "Aller au contenu" });
  await expect(lien).toBeFocused();
  await lien.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

for (const adresse of ["", `parcours/${PARCOURS.slug}/${LECON.slug}`, "recherche?q=briques"]) {
  test(`/app/${adresse} en thème sombre respecte les contrastes`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await simulerLecons(page);
    await page.goto(`./${adresse}`);
    await verifierAccessibilite(page);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`un exercice, solution affichée, est accessible (thème ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await simulerLecons(page);
    await page.goto(`./lecons/${LECON.slug}`);
    await page.getByRole("button", { name: "Afficher la solution" }).click();
    await expect(page.getByText("console.log(n * 2);")).toBeVisible();
    await verifierAccessibilite(page);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`l'éditeur de code, suggestions et sélection affichées, est accessible (thème ${theme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await simulerLecons(page);
    await page.goto(`./lecons/${LECON.slug}`);
    const editeur = page.getByRole("textbox", { name: "Code Python, modifiable" });
    await editeur.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("pre");
    await expect(page.getByRole("listbox")).toBeVisible();
    await verifierAccessibilite(page);

    // Texte sélectionné, sur la ligne active comprise.
    await page.keyboard.press("Escape");
    await page.keyboard.press("ControlOrMeta+a");
    await verifierAccessibilite(page);
  });
}

for (const [appareil, choix, attendu] of [
  ["light", "Sombre", "dark"],
  ["dark", "Clair", "light"],
] as const) {
  test(`le thème ${choix} choisi dans le profil remplace celui de l'appareil (${appareil})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: appareil });
    await simulerLecons(page);
    await page.goto("./profil");
    await page.getByText(choix, { exact: true }).click();
    await expect(page.getByRole("radio", { name: choix })).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-theme", attendu);

    // Le choix est retenu d'une visite à l'autre.
    await page.goto(`./parcours/${PARCOURS.slug}/${LECON.slug}`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", attendu);
    await verifierAccessibilite(page);
  });
}
