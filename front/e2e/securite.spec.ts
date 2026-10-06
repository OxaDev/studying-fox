import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
  CSP_MEDIAS,
  CSP_PAGE,
  CSP_WORKER_JAVASCRIPT,
  CSP_WORKER_VBA,
  cspWorkerPython,
} from "../csp";

const CADDYFILE = readFileSync(new URL("../../infra/caddy/Caddyfile", import.meta.url), "utf-8");

test("le Caddyfile applique les mêmes CSP que les tests", () => {
  expect(CADDYFILE).toContain(`Content-Security-Policy "${CSP_PAGE}"`);
  expect(CADDYFILE).toContain(`Content-Security-Policy "${CSP_MEDIAS}"`);
  expect(CADDYFILE).toContain(`Content-Security-Policy "${CSP_WORKER_JAVASCRIPT}"`);
  expect(CADDYFILE).toContain(`Content-Security-Policy "${CSP_WORKER_VBA}"`);
  expect(CADDYFILE).toContain(
    `Content-Security-Policy "${cspWorkerPython("{scheme}://{hostport}")}"`,
  );
});

test("la page est servie avec sa CSP", async ({ request }) => {
  const reponse = await request.get("./");

  expect(reponse.headers()["content-security-policy"]).toBe(CSP_PAGE);
});
