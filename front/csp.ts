/**
 * Politiques de sécurité du contenu (CSP).
 *
 * Elles sont appliquées par Caddy en production (infra/caddy/Caddyfile) et par `vite preview`
 * pour les tests Playwright. Un test vérifie que le Caddyfile contient exactement les mêmes.
 *
 * Les workers d'exécution (ADR 0009) ont chacun leur propre politique, plus stricte que la page :
 * le code d'une leçon ne peut ni appeler l'API, ni envoyer de données ailleurs.
 */

/** Page de l'application. Aucune ressource externe (ADR 0014). */
export const CSP_PAGE = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** Worker JavaScript : il peut exécuter du code, mais n'a accès à rien, pas même au réseau. */
export const CSP_WORKER_JAVASCRIPT = "default-src 'none'; script-src 'unsafe-eval'";

/** Worker Python : il ne peut charger que les fichiers de Pyodide, hébergés sous /app/pyodide/. */
export function cspWorkerPython(origine: string): string {
  const pyodide = `${origine}/app/pyodide/`;
  return `default-src 'none'; script-src ${pyodide} 'wasm-unsafe-eval'; connect-src ${pyodide}`;
}

/**
 * Worker VBA : l'interpréteur est du TypeScript ordinaire (ADR 0026).
 * Il n'a besoin ni d'eval, ni du réseau : tout lui est interdit.
 */
export const CSP_WORKER_VBA = "default-src 'none'";

/**
 * Images des leçons (/medias/). Une image SVG peut contenir du script :
 * `sandbox` l'empêche de s'exécuter si quelqu'un ouvre l'image directement.
 */
export const CSP_MEDIAS = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/** Fichiers des workers, nommés ainsi par la config Vite (worker.rollupOptions). */
export const PREFIXE_WORKER_JAVASCRIPT = "/app/assets/worker-javascript-";
export const PREFIXE_WORKER_PYTHON = "/app/assets/worker-python-";
export const PREFIXE_WORKER_VBA = "/app/assets/worker-vba-";

export function cspPour(chemin: string, origine: string): string {
  if (chemin.startsWith("/medias/")) return CSP_MEDIAS;
  if (chemin.startsWith(PREFIXE_WORKER_JAVASCRIPT)) return CSP_WORKER_JAVASCRIPT;
  if (chemin.startsWith(PREFIXE_WORKER_PYTHON)) return cspWorkerPython(origine);
  if (chemin.startsWith(PREFIXE_WORKER_VBA)) return CSP_WORKER_VBA;
  return CSP_PAGE;
}
