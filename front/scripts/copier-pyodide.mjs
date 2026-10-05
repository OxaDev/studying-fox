// Copie Pyodide dans public/pyodide/ : il est servi par nous, jamais par un CDN (ADR 0009, 0014).
// Lancé automatiquement après `npm install`.
import { copyFileSync, mkdirSync } from "node:fs";

const FICHIERS = [
  "pyodide.mjs",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
];

const source = new URL("../node_modules/pyodide/", import.meta.url);
const destination = new URL("../public/pyodide/", import.meta.url);

mkdirSync(destination, { recursive: true });
for (const fichier of FICHIERS) {
  copyFileSync(new URL(fichier, source), new URL(fichier, destination));
}
console.log(`Pyodide copié dans public/pyodide/ (${FICHIERS.length} fichiers).`);
