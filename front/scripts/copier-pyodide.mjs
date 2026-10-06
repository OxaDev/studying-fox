// Copie Pyodide dans public/pyodide/ : il est servi par nous, jamais par un CDN (ADR 0009, 0014).
// Télécharge aussi les bibliothèques des leçons (ADR 0028), vérifiées par leur empreinte SHA-256 :
// - celles de la distribution Pyodide, avec les empreintes de son pyodide-lock.json ;
// - celles de PyPI, avec les empreintes figées dans paquets-python.lock.json.
// Lancé automatiquement après `npm install`.
//
//   node scripts/copier-pyodide.mjs --verrouiller   choisit les versions PyPI et écrit le lock
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const FICHIERS = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip"];

const source = new URL("../node_modules/pyodide/", import.meta.url);
const destination = new URL("../public/pyodide/", import.meta.url);
const manifeste = JSON.parse(
  readFileSync(new URL("paquets-python.json", import.meta.url), "utf-8"),
);
const cheminLock = new URL("paquets-python.lock.json", import.meta.url);

/** Nom normalisé, comme les clés du pyodide-lock.json : « Pydantic_Core » devient « pydantic-core ». */
const normaliser = (nom) => nom.toLowerCase().replace(/[-_.]+/g, "-");
const empreinte = (contenu) => createHash("sha256").update(contenu).digest("hex");

async function telecharger(url, sha256, fichier) {
  const chemin = new URL(fichier, destination);
  if (existsSync(chemin) && empreinte(readFileSync(chemin)) === sha256) return false;
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`Téléchargement impossible (${reponse.status}) : ${url}`);
  const contenu = Buffer.from(await reponse.arrayBuffer());
  if (empreinte(contenu) !== sha256) throw new Error(`Empreinte SHA-256 incorrecte : ${fichier}`);
  writeFileSync(chemin, contenu);
  return true;
}

/** Version la plus récente qui commence par le préfixe voulu (« 6.0 » donne la dernière 6.0.x). */
function choisirVersion(versions, prefixe) {
  const comparer = (a, b) => {
    const x = a.split(".").map(Number);
    const y = b.split(".").map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
    }
    return 0;
  };
  return Object.keys(versions)
    .filter((v) => /^\d+(\.\d+)*$/.test(v) && (v === prefixe || v.startsWith(`${prefixe}.`)))
    .filter((v) =>
      versions[v].some(
        (f) =>
          f.packagetype === "bdist_wheel" && f.filename.endsWith("py3-none-any.whl") && !f.yanked,
      ),
    )
    .sort(comparer)
    .at(-1);
}

async function verrouiller() {
  const lock = { pypi: {} };
  for (const [nom, souhait] of Object.entries(manifeste.pypi)) {
    const reponse = await fetch(`https://pypi.org/pypi/${nom}/json`);
    if (!reponse.ok) throw new Error(`PyPI ne connaît pas ${nom} (${reponse.status})`);
    const { releases } = await reponse.json();
    const version = choisirVersion(releases, souhait.version);
    if (!version) throw new Error(`Aucune roue Python pure pour ${nom} ${souhait.version}`);
    const roue = releases[version].find((f) => f.filename.endsWith("py3-none-any.whl"));
    lock.pypi[nom] = {
      version,
      file_name: roue.filename,
      url: roue.url,
      sha256: roue.digests.sha256,
    };
    console.log(`${nom} ${version}`);
  }
  writeFileSync(cheminLock, JSON.stringify(lock, null, 2) + "\n");
  return lock;
}

mkdirSync(destination, { recursive: true });
for (const fichier of FICHIERS)
  copyFileSync(new URL(fichier, source), new URL(fichier, destination));

const verrou = process.argv.includes("--verrouiller")
  ? await verrouiller()
  : existsSync(cheminLock)
    ? JSON.parse(readFileSync(cheminLock, "utf-8"))
    : null;
if (!verrou)
  throw new Error(
    "paquets-python.lock.json manque : lance node scripts/copier-pyodide.mjs --verrouiller",
  );

const lockPyodide = JSON.parse(readFileSync(new URL("pyodide-lock.json", source), "utf-8"));
const { version } = JSON.parse(readFileSync(new URL("package.json", source), "utf-8"));
const cdn = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;

// Les paquets de la distribution Pyodide demandés, avec leurs dépendances.
const voulus = new Set();
const ajouter = (nom) => {
  const cle = normaliser(nom);
  if (voulus.has(cle) || manifeste.pypi[cle]) return;
  const paquet = lockPyodide.packages[cle];
  if (!paquet) throw new Error(`Paquet inconnu de Pyodide : ${nom}`);
  voulus.add(cle);
  paquet.depends.forEach(ajouter);
};
manifeste.pyodide.forEach(ajouter);
Object.values(manifeste.pypi).forEach((souhait) => souhait.depends.forEach(ajouter));

let telecharges = 0;
for (const cle of voulus) {
  const paquet = lockPyodide.packages[cle];
  if (await telecharger(cdn + paquet.file_name, paquet.sha256, paquet.file_name)) telecharges++;
}

// Les roues PyPI, ajoutées au lock de Pyodide pour qu'il les charge comme les siennes.
for (const [nom, souhait] of Object.entries(manifeste.pypi)) {
  const fige = verrou.pypi[nom];
  if (!fige)
    throw new Error(`${nom} manque dans paquets-python.lock.json : relance avec --verrouiller`);
  if (await telecharger(fige.url, fige.sha256, fige.file_name)) telecharges++;
  lockPyodide.packages[normaliser(nom)] = {
    name: nom,
    version: fige.version,
    file_name: fige.file_name,
    install_dir: "site",
    sha256: fige.sha256,
    package_type: "package",
    imports: souhait.imports,
    depends: souhait.depends.map(normaliser),
    unvendored_tests: false,
    tool: {},
  };
}
writeFileSync(new URL("pyodide-lock.json", destination), JSON.stringify(lockPyodide));

const total = voulus.size + Object.keys(manifeste.pypi).length;
console.log(
  `Pyodide copié dans public/pyodide/, avec ${total} bibliothèques (${telecharges} téléchargées).`,
);
