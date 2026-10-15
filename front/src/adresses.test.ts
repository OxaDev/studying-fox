import { describe, expect, it } from "vitest";

import { adresseMedia, BASE_API, BASE_APP, cheminDuSite } from "./adresses";

describe("Adresses du site (ADR 0031)", () => {
  it("déduit le chemin du site de la base de Vite", () => {
    expect(cheminDuSite("/app/")).toBe("");
    expect(cheminDuSite("/studying-fox/app/")).toBe("/studying-fox");
  });

  it("place l'application et l'API à la racine par défaut", () => {
    expect(BASE_APP).toBe("/app");
    expect(BASE_API).toBe("/api");
  });

  it("ajoute le chemin du site aux images importées seulement", () => {
    expect(adresseMedia("/medias/imports/1/a.png", "/studying-fox")).toBe(
      "/studying-fox/medias/imports/1/a.png",
    );
    expect(adresseMedia("/medias/imports/1/a.png", "")).toBe("/medias/imports/1/a.png");
    expect(adresseMedia("https://exemple.fr/a.png", "/studying-fox")).toBe(
      "https://exemple.fr/a.png",
    );
  });
});
