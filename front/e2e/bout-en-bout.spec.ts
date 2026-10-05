import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { expect, type Page, test } from "@playwright/test";

// Avec la vraie API (aucune simulation). Les scénarios partagent la même base et la même file
// de relecture : ils s'exécutent l'un après l'autre.
test.describe.configure({ mode: "serial" });
const EXEMPLE = fileURLToPath(new URL("../../docs/format-lecon/exemple.json", import.meta.url));
const MOT_DE_PASSE = "mot-de-passe-de-test"; // api/app/dev.py

async function seConnecter(page: Page, email: string) {
  await page.goto("./connexion");
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Bonjour/ })).toBeVisible();
}

test("exemple.json est importé, vérifié et publié d'un coup, puis suivi par un apprenant", async ({
  page,
  browser,
}) => {
  test.slow();

  // 1. La relectrice importe le fichier. Le code est exécuté pour de vrai (Pyodide).
  await seConnecter(page, "relectrice@exemple.fr");
  await page.getByRole("link", { name: "Relecture" }).click();
  await page.getByRole("link", { name: "Importer des leçons" }).click();
  await page.getByLabel("Fichier à importer").setInputFiles(EXEMPLE);
  await page.getByRole("button", { name: "Analyser le fichier" }).click();
  await expect(page.getByText("Tous les exemples donnent le résultat attendu.")).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole("button", { name: "Importer 2 leçons en brouillon" }).click();
  await expect(page.getByRole("heading", { name: "Import réussi" })).toBeVisible();

  // 2. Elle publie tout le parcours en une fois : les leçons importées sont cochées.
  const selection = page.getByRole("group", { name: "Publier maintenant" });
  await expect(selection.getByRole("checkbox", { name: "Tout sélectionner" })).toBeChecked();
  await page.getByRole("button", { name: "Publier 2 leçons" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Publier" }).click();
  await expect(page.getByText("2 leçons publiées.")).toBeVisible();
  await page.getByRole("link", { name: "Aller à la relecture" }).click();
  await expect(page.getByText("Rien à relire pour l'instant.")).toBeVisible();

  // 3. Un apprenant suit le parcours publié.
  const contexte = await browser.newContext();
  const apprenant = await contexte.newPage();
  await seConnecter(apprenant, "apprenant@exemple.fr");
  await apprenant.getByRole("link", { name: "Parcours", exact: true }).click();
  await apprenant.getByRole("link", { name: "Premiers pas en Python" }).click();
  await apprenant.getByRole("link", { name: "Commencer le parcours" }).click();
  await expect(
    apprenant.getByRole("heading", { level: 1, name: "Afficher du texte" }),
  ).toBeVisible();
  await expect(apprenant.getByText("rédigée avec l'aide d'une IA", { exact: false })).toBeVisible();

  await apprenant.getByRole("button", { name: "Exécuter" }).click();
  await expect(apprenant.getByRole("group").locator("pre")).toHaveText("Bonjour !", {
    timeout: 60_000,
  });
  await apprenant.getByRole("button", { name: "Leçon terminée" }).click();
  await expect(apprenant.getByRole("button", { name: "Leçon terminée" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await apprenant.getByRole("link", { name: "Mon espace" }).click();
  await expect(apprenant.getByText("1 leçon terminée")).toBeVisible();
  await expect(apprenant.getByRole("progressbar", { name: "Avancement global" })).toHaveAttribute(
    "aria-valuenow",
    "50",
  );
  await contexte.close();
});

test("un contributeur propose une leçon depuis le site, elle est relue et publiée", async ({
  page,
  browser,
}) => {
  test.slow();

  // 1. La contributrice crée la leçon et l'écrit dans l'éditeur.
  await seConnecter(page, "contributeur@exemple.fr");
  await page.getByRole("link", { name: "Contribuer" }).click();
  await page.getByRole("link", { name: "Écrire une nouvelle leçon" }).click();
  await page.getByLabel("Titre").fill("Les boucles for");
  await expect(page.getByLabel("Identifiant")).toHaveValue("les-boucles-for");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Écrire « Les boucles for »" }),
  ).toBeVisible();
  await page.getByLabel("Résumé").fill("Répéter une action plusieurs fois avec une boucle for.");
  await page.getByLabel("Objectifs").fill("Écrire une boucle for");
  await page.getByRole("textbox", { name: "Contenu de la leçon, en Markdown" }).click();
  await page.keyboard.insertText("Une **boucle** répète du code.\n");
  await page.getByRole("button", { name: "Code Python exécutable" }).click();

  // L'aperçu exécute vraiment le code inséré.
  const apercu = page.getByRole("region", { name: "Aperçu" });
  await apercu.getByRole("button", { name: "Exécuter" }).click();
  await expect(apercu.locator("pre").last()).toHaveText("Bonjour !", { timeout: 60_000 });

  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await expect(page.getByText(/Enregistré le/)).toBeVisible();
  await page.locator("label", { hasText: "J'accepte que mes contributions" }).click();
  await page.getByRole("button", { name: "Soumettre à la relecture" }).click();
  await expect(page.getByText("Ta proposition est en relecture.", { exact: false })).toBeVisible();

  // 2. La relectrice la publie.
  const contexte = await browser.newContext();
  const relectrice = await contexte.newPage();
  await seConnecter(relectrice, "relectrice@exemple.fr");
  await relectrice.getByRole("link", { name: "Relecture" }).click();
  await relectrice.getByRole("table").getByRole("link", { name: "Les boucles for" }).click();
  await expect(relectrice.getByText("Auteur : contributeur")).toBeVisible();
  await relectrice.locator("label", { hasText: "Publier" }).click();
  await relectrice.getByRole("button", { name: "Enregistrer la décision" }).click();
  await expect(relectrice.getByText(/statut : Publiée/)).toBeVisible();
  await contexte.close();

  // 3. La contributrice voit sa leçon publiée.
  await page.getByRole("link", { name: "Contribuer" }).click();
  await expect(page.getByRole("table").getByText("Publiée")).toBeVisible();
  await page.goto("./lecons/les-boucles-for");
  await expect(page.getByRole("heading", { level: 1, name: "Les boucles for" })).toBeVisible();
  await expect(page.getByText("Auteur : contributeur.", { exact: false })).toBeVisible();
});

test("un apprenant trouve une leçon par la recherche, sans accent ni pluriel exact", async ({
  page,
}) => {
  await seConnecter(page, "apprenant@exemple.fr");
  await page.getByRole("link", { name: "Rechercher" }).click();

  const recherche = page.getByRole("search", { name: "Leçons et parcours" });
  await recherche.getByLabel("Mots-clés").fill("boites");
  await recherche.getByRole("button", { name: "Rechercher" }).click();

  await expect(page.getByRole("status")).toHaveText("1 résultat pour « boites ».");
  const lecons = page.getByRole("region", { name: "Leçons (1)" });
  await expect(lecons.locator("mark", { hasText: "boîte" }).first()).toBeVisible();
  await lecons.getByRole("link", { name: "Les variables" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Les variables" })).toBeVisible();

  // Le retour arrière restaure la recherche.
  await page.goBack();
  await expect(page.getByLabel("Mots-clés")).toHaveValue("boites");
  await page.getByLabel("Type").selectOption("parcours");
  await page.getByLabel("Mots-clés").fill("");
  await page.getByRole("button", { name: "Rechercher" }).click();
  await expect(
    page.getByRole("region", { name: /^Parcours/ }).getByRole("link", {
      name: "Premiers pas en Python",
    }),
  ).toBeVisible();
});

test("un visiteur découvre le parcours publié, sans connexion ni JavaScript", async ({
  browser,
  request,
}) => {
  const visiteur = await browser.newPage({ javaScriptEnabled: false });
  await visiteur.goto("/parcours");
  await visiteur.getByRole("link", { name: "Premiers pas en Python" }).click();

  await expect(
    visiteur.getByRole("heading", { level: 1, name: "Premiers pas en Python" }),
  ).toBeVisible();
  const programme = visiteur.getByRole("region", { name: "Au programme" });
  await expect(programme.getByRole("listitem")).toHaveText([/Afficher du texte/, /Les variables/]);
  // Les titres seulement : le contenu des leçons reste réservé aux inscrits (ADR 0016).
  await expect(visiteur.getByText("boîte")).toHaveCount(0);
  await visiteur.getByRole("link", { name: "Commencer ce parcours" }).click();
  await expect(visiteur).toHaveURL(/\/app\/inscription$/);
  await visiteur.close();

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("<loc>http://localhost:4173/parcours/premiers-pas-en-python</loc>");
});

test("un admin crée un thème, qui apparaît au journal", async ({ page }) => {
  await seConnecter(page, "admin@exemple.fr");
  await page.getByRole("link", { name: "Administration" }).click();
  await page.getByRole("link", { name: "Thèmes" }).click();

  const nouveau = page.getByRole("region", { name: "Nouveau thème" });
  await nouveau.getByLabel("Nom").fill("Bases de données");
  await expect(nouveau.getByLabel("Identifiant")).toHaveValue("bases-de-donnees");
  await nouveau.getByRole("button", { name: "Créer le thème" }).click();
  await expect(page.getByRole("status")).toHaveText("Thème « Bases de données » créé.");
  await expect(page.getByRole("row", { name: /Bases de données/ })).toBeVisible();

  await page.getByRole("link", { name: "Journal" }).click();
  const ligne = page.getByRole("row", { name: /Création de thème/ });
  await expect(ligne).toContainText("admin");
  await expect(ligne).toContainText("Thème bases-de-donnees");
});

test("un apprenant télécharge ses données puis supprime son compte", async ({ page }) => {
  await seConnecter(page, "partant@exemple.fr");
  await page.getByRole("link", { name: "Mon profil" }).click();

  const telechargement = page.waitForEvent("download");
  await page.getByRole("link", { name: "Télécharger mes données" }).click();
  const fichier = await telechargement;
  expect(fichier.suggestedFilename()).toBe("mes-donnees-renard-etudiant.json");
  const chemin = await fichier.path();
  const donnees = JSON.parse(await readFile(chemin, "utf-8")) as { compte: { email: string } };
  expect(donnees.compte.email).toBe("partant@exemple.fr");

  await page.getByRole("button", { name: "Supprimer mon compte" }).click();
  const fenetre = page.getByRole("dialog", { name: "Supprimer ton compte ?" });
  await fenetre.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
  await fenetre.getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(page.getByText("Ton compte a bien été supprimé")).toBeVisible();

  // Le compte n'existe plus : la connexion échoue.
  await page.getByLabel("Adresse email").fill("partant@exemple.fr");
  await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("on s'inscrit puis on se connecte aussitôt, sans email de confirmation", async ({ page }) => {
  await page.goto("./inscription");
  await page.getByLabel("Adresse email").fill("nouvelle@exemple.fr");
  await page.getByLabel("Pseudo").fill("nouvelle");
  await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Créer mon compte" }).click();

  await expect(page.getByText("Ton compte est créé")).toBeVisible();
  await expect(page.getByLabel("Adresse email")).toHaveValue("nouvelle@exemple.fr");
  await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Bonjour nouvelle !" })).toBeVisible();
});
