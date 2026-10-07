/**
 * Vérifie un paquet de leçons comme le fait l'import (ADR 0019) : chaque exemple exécutable
 * et chaque solution d'exercice est lancé, et sa sortie comparée à `sortie_attendue`.
 * Chaque illustration passe par la liste blanche (ADR 0029).
 *
 *   npm run verifier -- mon-paquet.json [autre-paquet.json…]
 *
 * Python tourne dans Pyodide avec les mêmes bibliothèques que le navigateur, VBA et JavaScript
 * avec les mêmes interpréteurs.
 */
import { readFileSync } from "node:fs";

import { JSDOM } from "jsdom";

import { executerJavascript } from "../src/features/execution/executerJavascript";
import { executerVba } from "../src/features/execution/vba/interpreteur";
import { analyserSvg } from "../src/features/lecons/illustration/analyse";
import { illustrationsDuPaquet } from "../src/features/lecons/illustration/paquet";
import { executerCodePython } from "./pyodide-node";

interface Bloc {
  type: string;
  langage?: string;
  code?: string;
  solution?: string;
  executable?: boolean;
  sortie_attendue?: string | null;
  svg?: string;
  alt?: string;
  description?: string;
  legende?: string | null;
}

interface Paquet {
  lecons: { slug: string; blocs: Bloc[] }[];
}

async function executer(
  langage: string,
  code: string,
): Promise<{ sortie: string; erreur: string | null }> {
  if (langage === "python") return executerCodePython(code);
  let sortie = "";
  if (langage === "vba") {
    const resultat = executerVba(code, { ecrire: (texte) => (sortie += texte) });
    return { sortie, erreur: resultat.erreur };
  }
  const erreur = await executerJavascript(code, (flux, texte) => {
    if (flux === "stdout") sortie += texte;
  });
  return { sortie, erreur };
}

const parseur = new new JSDOM().window.DOMParser();
let ecarts = 0;
let verifies = 0;
let illustrations = 0;
for (const fichier of process.argv.slice(2)) {
  const paquet = JSON.parse(readFileSync(fichier, "utf-8")) as Paquet;
  for (const illustration of illustrationsDuPaquet(paquet)) {
    illustrations++;
    const analyse = analyserSvg(illustration.svg, parseur);
    if (analyse.valide) continue;
    ecarts++;
    process.stdout.write(`✗ ${fichier} › ${illustration.emplacement} (illustration)\n`);
    for (const erreur of analyse.erreurs) process.stdout.write(`  ${erreur}\n`);
  }
  for (const lecon of paquet.lecons) {
    for (const [index, bloc] of lecon.blocs.entries()) {
      const code =
        bloc.type === "exercice"
          ? bloc.solution
          : bloc.type === "code" && (bloc.executable || bloc.sortie_attendue != null)
            ? bloc.code
            : undefined;
      if (!code || !bloc.langage) continue;
      verifies++;
      const { sortie, erreur } = await executer(bloc.langage, code);
      const attendue = bloc.sortie_attendue ?? null;
      if (erreur === null && (attendue === null || sortie.trimEnd() === attendue.trimEnd()))
        continue;
      ecarts++;
      process.stdout.write(`✗ ${fichier} › ${lecon.slug} › bloc ${String(index + 1)}\n`);
      if (erreur) process.stdout.write(`  erreur : ${erreur}\n`);
      else
        process.stdout.write(
          `  attendu : ${JSON.stringify(attendue)}\n  obtenu  : ${JSON.stringify(sortie)}\n`,
        );
    }
  }
}
const bilan = `${String(verifies)} codes et ${String(illustrations)} illustration(s)`;
process.stdout.write(
  ecarts === 0
    ? `${bilan} vérifiés, tous conformes.\n`
    : `${String(ecarts)} écart(s) sur ${bilan}.\n`,
);
process.exitCode = ecarts === 0 ? 0 : 1;
