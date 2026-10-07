/**
 * Captures des illustrations d'un paquet (ADR 0029), pour que leur auteur les regarde et
 * les corrige avant l'import. Le rendu est celui de la plateforme, dans Chromium.
 *
 *   npm run illustration -- mon-paquet.json [dessin.svg…] [--sortie dossier]
 *
 * Un fichier .svg seul doit contenir son <title> et son <desc>.
 * Pour chaque illustration : une capture en thème clair, une en thème sombre et une sur mobile.
 * Il faut Chromium pour Playwright : `npx playwright install chromium`.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { chromium } from "@playwright/test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

import { analyserSvg } from "../src/features/lecons/illustration/analyse";
import {
  type IllustrationDuPaquet,
  illustrationsDuPaquet,
  type PaquetAvecIllustrations,
} from "../src/features/lecons/illustration/paquet";

const RENDUS = [
  { nom: "clair", theme: "light", largeur: 900 },
  { nom: "sombre", theme: "dark", largeur: 900 },
  { nom: "mobile", theme: "light", largeur: 360 },
] as const;

const arguments_ = process.argv.slice(2);
const indexSortie = arguments_.indexOf("--sortie");
const sortie = resolve(
  indexSortie >= 0 ? (arguments_[indexSortie + 1] ?? ".") : join(tmpdir(), "renard-illustrations"),
);
const fichiers =
  indexSortie >= 0
    ? arguments_.filter((_, i) => i !== indexSortie && i !== indexSortie + 1)
    : arguments_;
if (fichiers.length === 0) {
  process.stderr.write("Usage : npm run illustration -- mon-paquet.json [--sortie dossier]\n");
  process.exit(2);
}

const illustrations: IllustrationDuPaquet[] = fichiers.flatMap((fichier) => {
  const contenu = readFileSync(fichier, "utf-8");
  if (fichier.endsWith(".svg")) {
    const nom = basename(fichier, ".svg");
    return [{ emplacement: nom, nom, svg: contenu }];
  }
  return illustrationsDuPaquet(JSON.parse(contenu) as PaquetAvecIllustrations);
});

// Le même contrôle qu'à l'import : une illustration refusée est signalée, et sa capture
// montre le message que verrait l'apprenant.
const parseur = new new JSDOM().window.DOMParser();
let refusees = 0;
for (const illustration of illustrations) {
  const analyse = analyserSvg(illustration.svg, parseur);
  if (analyse.valide) continue;
  refusees++;
  process.stdout.write(`✗ ${illustration.emplacement}\n`);
  for (const erreur of analyse.erreurs) process.stdout.write(`  ${erreur}\n`);
}

mkdirSync(sortie, { recursive: true });
const serveur = await createServer({
  root: resolve(import.meta.dirname, ".."),
  logLevel: "error",
  server: { port: 5199 },
});
await serveur.listen();
const navigateur = await chromium.launch();
try {
  const adresse = serveur.resolvedUrls?.local[0] ?? "http://localhost:5199/app/";
  for (const rendu of RENDUS) {
    const page = await navigateur.newPage({
      viewport: { width: rendu.largeur, height: 800 },
      deviceScaleFactor: 2,
    });
    await page.goto(`${adresse}scripts/apercu-illustrations/index.html`);
    await page.waitForFunction("typeof window.afficherIllustrations === 'function'");
    await page.evaluate(
      `window.afficherIllustrations(${JSON.stringify(illustrations)}, "${rendu.theme}")`,
    );
    await page.locator("[data-pret]").waitFor();
    await page.evaluate("document.fonts.ready");
    for (const [index, illustration] of illustrations.entries()) {
      const chemin = join(sortie, `${illustration.nom}-${rendu.nom}.png`);
      await page.locator(`[data-illustration="${String(index)}"]`).screenshot({ path: chemin });
      process.stdout.write(`${chemin}\n`);
    }
    await page.close();
  }
} finally {
  await navigateur.close();
  await serveur.close();
}

process.stdout.write(
  `${String(illustrations.length)} illustration(s), ${String(refusees)} refusée(s). ` +
    "Regarde chaque capture : texte lisible, rien ne déborde ni ne se chevauche.\n",
);
process.exitCode = refusees === 0 ? 0 : 1;
