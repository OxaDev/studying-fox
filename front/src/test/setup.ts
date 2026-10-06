import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { definirJetonCsrf } from "../api/client";

// CodeMirror mesure la position du texte, ce que jsdom ne sait pas faire.
Object.defineProperty(Range.prototype, "getClientRects", { value: () => [] });
Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => new DOMRect() });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  definirJetonCsrf(null);
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
