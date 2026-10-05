import { defineConfig, devices } from "@playwright/test";

// Les tests de bout en bout parlent à une vraie API, sur une base dédiée vidée à chaque lancement.
const PORT_API = 8001;
const ENV_API = {
  RENARD_ENVIRONNEMENT: "test",
  RENARD_COOKIE_SECURISE: "false",
  // Adresse vue par le navigateur (vite preview), pour les liens de la vitrine et du sitemap.
  RENARD_URL_PUBLIQUE: "http://localhost:4173",
  RENARD_DATABASE_URL:
    process.env.RENARD_DATABASE_URL_E2E ??
    "postgresql+asyncpg://renard:renard@localhost:5433/renard_e2e",
};

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:4173/app/",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: [
        "uv run python -m app.dev creer-base",
        "uv run alembic upgrade head",
        "uv run python -m app.dev preparer-e2e",
        `uv run uvicorn app.main:app --port ${String(PORT_API)}`,
      ].join(" && "),
      cwd: "../api",
      env: ENV_API,
      url: `http://localhost:${String(PORT_API)}/api/sante`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm run build && npm run preview -- --port 4173 --strictPort",
      env: { RENARD_API_URL: `http://localhost:${String(PORT_API)}` },
      url: "http://localhost:4173/app/",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
