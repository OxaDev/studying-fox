/// <reference types="vitest/config" />
import { createReadStream, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { cspPour } from "./csp";

/** Applique les mêmes CSP que Caddy à `vite preview`, pour que Playwright les teste. */
function cspEnPrevisualisation(): Plugin {
  return {
    name: "csp-en-previsualisation",
    configurePreviewServer(serveur) {
      serveur.middlewares.use((requete, reponse, suite) => {
        const chemin = (requete.url ?? "/").split("?")[0] ?? "/";
        const origine = `http://${requete.headers.host ?? "localhost"}`;
        reponse.setHeader("Content-Security-Policy", cspPour(chemin, origine));
        suite();
      });
    },
  };
}

const DOSSIER_PYODIDE = resolve(import.meta.dirname, "public", "pyodide");
const TYPES_PYODIDE: Record<string, string> = {
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".zip": "application/zip",
};

/**
 * En dev, Vite refuse qu'un module importe un fichier de public/ (« should not be imported
 * from source code »). Le worker Python importe pourtant pyodide.mjs : on sert donc
 * /app/pyodide/ tel quel, avant Vite. Le build n'est pas concerné (les fichiers y sont copiés).
 */
function pyodideEnDev(): Plugin {
  return {
    name: "pyodide-en-dev",
    apply: "serve",
    configureServer(serveur) {
      serveur.middlewares.use("/app/pyodide/", (requete, reponse, suite) => {
        const chemin = decodeURIComponent((requete.url ?? "/").split("?")[0] ?? "/");
        const fichier = resolve(join(DOSSIER_PYODIDE, chemin));
        // Refuse toute adresse qui sortirait du dossier de Pyodide (« ../ »).
        if (!fichier.startsWith(DOSSIER_PYODIDE + sep)) {
          suite();
          return;
        }
        try {
          if (!statSync(fichier).isFile()) {
            suite();
            return;
          }
        } catch {
          suite();
          return;
        }
        reponse.setHeader(
          "Content-Type",
          TYPES_PYODIDE[extname(fichier)] ?? "application/octet-stream",
        );
        createReadStream(fichier).pipe(reponse);
      });
    },
  };
}

// API cible du proxy : port 8010 en dev (8000 est souvent pris par d'autres projets).
// Les tests de bout en bout lancent leur propre API (playwright.config.ts).
const API = process.env.RENARD_API_URL ?? "http://localhost:8010";

// L'application React est servie sous /app (ADR 0020). Comme Caddy, le proxy envoie tout le
// reste à FastAPI : l'API, les images et la vitrine publique.
// `vite preview` reprend ce proxy (preview.proxy vaut server.proxy par défaut).
export default defineConfig({
  base: "/app/",
  plugins: [react(), cspEnPrevisualisation(), pyodideEnDev()],
  server: {
    proxy: {
      "^/(?!app(/|$))": API,
    },
  },
  worker: {
    format: "es",
    // Noms stables : Caddy leur applique une CSP dédiée (csp.ts).
    rollupOptions: { output: { entryFileNames: "assets/worker-[name]-[hash].js" } },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
