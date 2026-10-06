import { afterEach, describe, expect, it, vi } from "vitest";

import { choisirTheme, initialiserTheme, lireTheme } from "./theme";

describe("theme", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ignore une valeur enregistrée inconnue", () => {
    localStorage.setItem("renard-theme", "toString");

    expect(lireTheme()).toBe("systeme");
  });

  it("suit l'appareil quand le stockage est indisponible", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Stockage bloqué");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Stockage bloqué");
    });

    expect(lireTheme()).toBe("systeme");
    choisirTheme("sombre");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("applique le thème enregistré au démarrage", () => {
    localStorage.setItem("renard-theme", "sombre");

    initialiserTheme();

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("suit un changement fait dans un autre onglet", () => {
    initialiserTheme();

    localStorage.setItem("renard-theme", "clair");
    window.dispatchEvent(new StorageEvent("storage", { key: "renard-theme" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });
});
