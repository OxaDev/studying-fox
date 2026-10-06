/**
 * Exécute un code VBA comme la plateforme (ADR 0026), pour écrire ou vérifier une leçon.
 *
 *   npm run vba -- mon-code.bas
 *
 * La sortie (Debug.Print, MsgBox) va sur la sortie standard : c'est la `sortie_attendue`.
 * Les feuilles du classeur et l'erreur éventuelle vont sur la sortie d'erreur.
 */
import { readFileSync } from "node:fs";

import { lettresColonne } from "../src/features/execution/vba/classeur";
import { executerVba } from "../src/features/execution/vba/interpreteur";

const fichier = process.argv[2];
if (!fichier) {
  process.stderr.write("Usage : npm run vba -- mon-code.bas\n");
  process.exit(2);
}

const { erreur, feuilles } = executerVba(readFileSync(fichier, "utf-8"), {
  ecrire: (texte) => process.stdout.write(texte),
});

for (const feuille of feuilles) {
  const largeur = feuille.lignes[0]?.length ?? 0;
  const entete = ["", ...Array.from({ length: largeur }, (_, c) => lettresColonne(c + 1))];
  const lignes = feuille.lignes.map((cellules, l) => [
    String(l + 1),
    ...cellules.map((cellule) => cellule?.texte ?? ""),
  ]);
  process.stderr.write(`\nFeuille « ${feuille.nom} »${feuille.tronquee ? " (début)" : ""}\n`);
  for (const ligne of [entete, ...lignes]) process.stderr.write(ligne.join("\t") + "\n");
}
if (erreur) {
  process.stderr.write(`\n${erreur}\n`);
  process.exitCode = 1;
}
