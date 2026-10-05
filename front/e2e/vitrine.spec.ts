import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { CSP_PAGE } from "../csp";

// La vitrine est générée par la vraie API (ADR 0016), servie hors de /app (ADR 0020).
const PAGES = ["/", "/parcours", "/page-inexistante"];

async function verifierAccessibilite(page: Page) {
  await expect(page.locator("h1")).toHaveCount(1);
  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(resultat.violations).toEqual([]);
}

for (const adresse of PAGES) {
  test(`la vitrine ${adresse} respecte les règles WCAG 2.1 AA`, async ({ page }) => {
    await page.goto(adresse);
    await verifierAccessibilite(page);
  });
}

test("la vitrine respecte les contrastes en thème sombre", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await verifierAccessibilite(page);
});

test.describe("sans JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("l'accueil se lit et mène à l'inscription", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: "Apprends à programmer, à ton rythme" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Découvrir les parcours" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Nos parcours" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Créer un compte" })).toHaveAttribute(
      "href",
      "/app/inscription",
    );
  });

  test("le lien d'évitement mène au contenu", async ({ page }) => {
    await page.goto("/parcours");
    await page.keyboard.press("Tab");

    const lien = page.getByRole("link", { name: "Aller au contenu" });
    await expect(lien).toBeFocused();
    await lien.press("Enter");
    await expect(page.locator("main")).toBeFocused();
  });
});

test("la vitrine est servie avec la CSP des pages, et ses polices sont chez nous", async ({
  page,
}) => {
  const externes: string[] = [];
  page.on("request", (requete) => {
    if (!requete.url().startsWith("http://localhost:4173/")) externes.push(requete.url());
  });

  const reponse = await page.goto("/");

  expect(reponse?.headers()["content-security-policy"]).toBe(CSP_PAGE);
  await expect(page.locator("body")).toHaveCSS("font-family", /Nunito/);
  expect(externes).toEqual([]);
});

test("robots.txt exclut l'application et indique le sitemap", async ({ request }) => {
  const texte = await (await request.get("/robots.txt")).text();

  expect(texte).toContain("Disallow: /app/");
  expect(texte).toContain("Sitemap: http://localhost:4173/sitemap.xml");
});
