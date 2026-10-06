/**
 * Lancement du code Python d'une leçon, commun au worker et à l'outil `npm run python` (ADR 0028).
 * Ce module ne dépend pas du navigateur : il reçoit l'instance de Pyodide.
 */
import type { PyodideAPI } from "pyodide";

import { FICHIER_LECON } from "./traceback";

/**
 * Bibliothèques remises à neuf avant chaque exécution. L'interpréteur est partagé par tous
 * les exemples de la page ; Django garde sinon sa configuration d'un exemple à l'autre.
 */
const MODULES_REINITIALISES = ["django", "rest_framework"];

/**
 * Chaque exécution part d'un espace de noms vide : les exemples restent indépendants.
 * Le code est transmis comme chaîne JSON, qui est aussi une chaîne Python valide.
 * `await` est permis au niveau du module, comme dans un notebook (FastAPI, httpx).
 *
 * Dans Pyodide, la boucle asynchrone tourne toujours : Django refuserait d'accéder à la base
 * (SynchronousOnlyOperation). Sans threads, il n'y a pas d'accès concurrent : on l'autorise.
 */
export function lanceur(code: string): string {
  return [
    "async def __lancer_lecon():",
    "    import ast, os, sys",
    '    os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"',
    `    for nom in [n for n in sys.modules if n.split(".")[0] in ${JSON.stringify(MODULES_REINITIALISES)}]:`,
    "        del sys.modules[nom]",
    `    compile_ = compile(${JSON.stringify(code)}, "${FICHIER_LECON}", "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)`,
    '    resultat = eval(compile_, {"__name__": "__main__"})',
    "    if resultat is not None:",
    "        await resultat",
    "await __lancer_lecon()",
  ].join("\n");
}

/**
 * Vrai si le code importe une bibliothèque pas encore chargée.
 * On teste le paquet de premier niveau (`django` pour `django.apps`) : pour un nom à point,
 * find_spec importerait le parent, et Pyodide lève une erreur s'il n'est pas chargé.
 */
export function aDesPaquetsACharger(pyodide: PyodideAPI, code: string): boolean {
  const manquants = pyodide.runPython(
    [
      "import importlib.util",
      "from pyodide.code import find_imports",
      "def __manque(nom):",
      "    try:",
      '        return importlib.util.find_spec(nom.split(".")[0]) is None',
      "    except ImportError:",
      "        return True",
      `len([n for n in find_imports(${JSON.stringify(code)}) if __manque(n)])`,
    ].join("\n"),
  ) as unknown;
  return typeof manquants === "number" && manquants > 0;
}

/** Charge les bibliothèques importées par le code, depuis les fichiers hébergés avec Pyodide. */
export async function chargerPaquets(pyodide: PyodideAPI, code: string): Promise<void> {
  await pyodide.loadPackagesFromImports(code, {
    messageCallback: () => undefined,
    errorCallback: () => undefined,
  });
}

/** Exécute le code d'une leçon. Lève une erreur Python (PythonError) si le code échoue. */
export async function executerPython(pyodide: PyodideAPI, code: string): Promise<void> {
  await pyodide.runPythonAsync(lanceur(code));
}
