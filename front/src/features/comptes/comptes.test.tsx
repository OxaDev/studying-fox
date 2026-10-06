import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  afficherA,
  AVEC_VERIFICATION,
  CONNECTE,
  MOI,
  NON_CONNECTE,
  simulerApi,
} from "../../test/outils";

const MOT_DE_PASSE = "un-mot-de-passe-solide";

describe("Accès protégé", () => {
  it("renvoie vers la connexion sans session", async () => {
    simulerApi(NON_CONNECTE);

    const { router } = afficherA("/profil");

    expect(await screen.findByRole("heading", { level: 1, name: "Connexion" })).toBeInTheDocument();
    expect(router.state.location.search).toBe("?retour=%2Fprofil");
  });
});

describe("Connexion", () => {
  it("connecte l'utilisateur puis le ramène où il allait", async () => {
    const requetes = simulerApi({
      ...NON_CONNECTE,
      "POST /comptes/connexion": () => ({ statut: 200, corps: MOI }),
    });
    const utilisateur = userEvent.setup();
    afficherA("/connexion?retour=%2Fprofil");

    await utilisateur.type(await screen.findByLabelText("Adresse email"), MOI.email);
    await utilisateur.type(screen.getByLabelText("Mot de passe"), MOT_DE_PASSE);
    await utilisateur.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Mon profil" }),
    ).toBeInTheDocument();
    expect(requetes.find((r) => r.cle === "POST /comptes/connexion")?.corps).toEqual({
      email: MOI.email,
      mot_de_passe: MOT_DE_PASSE,
    });
  });

  it("affiche l'erreur renvoyée par l'API", async () => {
    simulerApi({
      ...NON_CONNECTE,
      "POST /comptes/connexion": () => ({
        statut: 401,
        corps: { detail: "Email ou mot de passe incorrect." },
      }),
    });
    const utilisateur = userEvent.setup();
    afficherA("/connexion");

    await utilisateur.type(await screen.findByLabelText("Adresse email"), MOI.email);
    await utilisateur.type(screen.getByLabelText("Mot de passe"), "pas-le-bon");
    await utilisateur.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email ou mot de passe incorrect.");
  });

  it("propose un nouveau lien si l'email n'est pas confirmé", async () => {
    simulerApi({
      ...NON_CONNECTE,
      "POST /comptes/connexion": () => ({
        statut: 403,
        corps: { detail: "Confirme d'abord ton adresse email." },
      }),
    });
    const utilisateur = userEvent.setup();
    afficherA("/connexion");

    await utilisateur.type(await screen.findByLabelText("Adresse email"), MOI.email);
    await utilisateur.type(screen.getByLabelText("Mot de passe"), MOT_DE_PASSE);
    await utilisateur.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(
      await screen.findByRole("link", { name: "Recevoir un nouveau lien de confirmation" }),
    ).toBeInTheDocument();
  });
});

describe("Inscription", () => {
  it("refuse un mot de passe trop court sans appeler l'API", async () => {
    const requetes = simulerApi(NON_CONNECTE);
    const utilisateur = userEvent.setup();
    afficherA("/inscription");

    await utilisateur.type(await screen.findByLabelText("Adresse email"), MOI.email);
    await utilisateur.type(screen.getByLabelText("Pseudo"), "aiko");
    await utilisateur.type(screen.getByLabelText("Mot de passe"), "court");
    await utilisateur.click(screen.getByRole("button", { name: "Créer mon compte" }));

    expect(await screen.findByText("12 caractères minimum.")).toBeInTheDocument();
    expect(requetes.some((r) => r.cle === "POST /comptes/inscription")).toBe(false);
  });

  it("annonce l'email de confirmation, si l'email est vérifié", async () => {
    simulerApi({
      ...NON_CONNECTE,
      ...AVEC_VERIFICATION,
      "POST /comptes/inscription": () => ({ statut: 204 }),
    });
    const utilisateur = userEvent.setup();
    afficherA("/inscription");

    await utilisateur.type(await screen.findByLabelText("Adresse email"), MOI.email);
    await utilisateur.type(screen.getByLabelText("Pseudo"), "aiko");
    await utilisateur.type(screen.getByLabelText("Mot de passe"), MOT_DE_PASSE);
    await utilisateur.click(screen.getByRole("button", { name: "Créer mon compte" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      `Un email vient de partir vers ${MOI.email}`,
    );
  });

  it("signale un pseudo déjà pris", async () => {
    simulerApi({
      ...NON_CONNECTE,
      "POST /comptes/inscription": () => ({
        statut: 409,
        corps: { detail: "Ce pseudo est déjà pris." },
      }),
    });
    const utilisateur = userEvent.setup();
    afficherA("/inscription");

    await utilisateur.type(await screen.findByLabelText("Adresse email"), MOI.email);
    await utilisateur.type(screen.getByLabelText("Pseudo"), "aiko");
    await utilisateur.type(screen.getByLabelText("Mot de passe"), MOT_DE_PASSE);
    await utilisateur.click(screen.getByRole("button", { name: "Créer mon compte" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ce pseudo est déjà pris.");
  });
});

describe("Sans vérification de l'email (ADR 0023)", () => {
  it("mène à la connexion juste après l'inscription", async () => {
    simulerApi({ ...NON_CONNECTE, "POST /comptes/inscription": () => ({ statut: 204 }) });
    const utilisateur = userEvent.setup();
    const { router } = afficherA("/inscription");

    await utilisateur.type(await screen.findByLabelText("Adresse email"), MOI.email);
    await utilisateur.type(screen.getByLabelText("Pseudo"), "aiko");
    await utilisateur.type(screen.getByLabelText("Mot de passe"), MOT_DE_PASSE);
    await utilisateur.click(screen.getByRole("button", { name: "Créer mon compte" }));

    expect(await screen.findByText(/Ton compte est créé/)).toBeVisible();
    expect(router.state.location.pathname).toBe("/connexion");
    expect(screen.getByLabelText("Adresse email")).toHaveValue(MOI.email);
  });

  it("ne propose pas de réinitialiser le mot de passe par email", async () => {
    simulerApi(NON_CONNECTE);

    afficherA("/connexion");

    await screen.findByRole("heading", { level: 1, name: "Connexion" });
    expect(screen.queryByRole("link", { name: "Mot de passe oublié ?" })).toBeNull();
  });

  it("change l'adresse email tout de suite", async () => {
    simulerApi({ ...CONNECTE, "POST /comptes/moi/email": () => ({ statut: 204 }) });
    const utilisateur = userEvent.setup();
    afficherA("/profil");

    await utilisateur.type(await screen.findByLabelText("Nouvelle adresse email"), "a@b.fr");
    await utilisateur.type(
      screen.getAllByLabelText("Mot de passe actuel")[0] as HTMLElement,
      MOT_DE_PASSE,
    );
    await utilisateur.click(screen.getByRole("button", { name: "Changer d'adresse" }));

    expect(await screen.findByText("Adresse email changée.")).toBeVisible();
  });
});

describe("Avec vérification de l'email", () => {
  it("propose de réinitialiser le mot de passe", async () => {
    simulerApi({ ...NON_CONNECTE, ...AVEC_VERIFICATION });

    afficherA("/connexion");

    expect(await screen.findByRole("link", { name: "Mot de passe oublié ?" })).toBeVisible();
  });
});

describe("Confirmation de l'adresse", () => {
  it("confirme au clic, pas à l'ouverture du lien", async () => {
    const requetes = simulerApi({
      ...NON_CONNECTE,
      "POST /comptes/confirmation": () => ({ statut: 204 }),
    });
    const utilisateur = userEvent.setup();
    afficherA("/confirmation?jeton=abc");

    const bouton = await screen.findByRole("button", { name: "Confirmer mon adresse" });
    expect(requetes.some((r) => r.cle === "POST /comptes/confirmation")).toBe(false);
    await utilisateur.click(bouton);

    expect(await screen.findByRole("status")).toHaveTextContent("Ton adresse est confirmée.");
    expect(requetes.find((r) => r.cle === "POST /comptes/confirmation")?.corps).toEqual({
      jeton: "abc",
    });
  });
});

describe("Profil", () => {
  it("envoie le jeton CSRF quand on modifie son pseudo", async () => {
    const requetes = simulerApi({
      ...CONNECTE,
      "PATCH /comptes/moi": () => ({ statut: 200, corps: { ...MOI, pseudo: "kitsune" } }),
    });
    const utilisateur = userEvent.setup();
    afficherA("/profil");

    const champ = await screen.findByLabelText("Pseudo");
    await utilisateur.clear(champ);
    await utilisateur.type(champ, "kitsune");
    await utilisateur.click(screen.getByRole("button", { name: "Enregistrer le pseudo" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Pseudo enregistré.");
    const modification = requetes.find((r) => r.cle === "PATCH /comptes/moi");
    expect(modification?.entetes.get("X-CSRF-Token")).toBe(MOI.jeton_csrf);
    expect(screen.getByText("kitsune", { selector: "header *" })).toBeInTheDocument();
  });

  it("se déconnecte et revient à la connexion", async () => {
    const requetes = simulerApi({
      ...CONNECTE,
      "POST /comptes/deconnexion": () => ({ statut: 204 }),
    });
    const utilisateur = userEvent.setup();
    afficherA("/");

    await utilisateur.click(await screen.findByRole("button", { name: "Se déconnecter" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Connexion" })).toBeInTheDocument();
    expect(requetes.some((r) => r.cle === "POST /comptes/deconnexion")).toBe(true);
  });
});

describe("Thème", () => {
  it("suit l'appareil par défaut", async () => {
    simulerApi(CONNECTE);
    afficherA("/profil");

    const groupe = await screen.findByRole("radiogroup", { name: "Thème" });
    expect(within(groupe).getByRole("radio", { name: "Comme mon appareil" })).toBeChecked();
    expect(groupe).toHaveAccessibleDescription("Ce choix est retenu par ce navigateur seulement.");
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });

  it("applique et retient le thème choisi", async () => {
    simulerApi(CONNECTE);
    const utilisateur = userEvent.setup();
    afficherA("/profil");

    await utilisateur.click(await screen.findByRole("radio", { name: "Sombre" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("renard-theme")).toBe("sombre");

    await utilisateur.click(screen.getByRole("radio", { name: "Clair" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");

    await utilisateur.click(screen.getByRole("radio", { name: "Comme mon appareil" }));
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(localStorage.getItem("renard-theme")).toBeNull();
  });

  it("affiche le thème retenu lors d'une visite précédente", async () => {
    localStorage.setItem("renard-theme", "clair");
    simulerApi(CONNECTE);
    afficherA("/profil");

    expect(await screen.findByRole("radio", { name: "Clair" })).toBeChecked();
  });
});

describe("Mes données", () => {
  it("propose de télécharger ses données", async () => {
    simulerApi(CONNECTE);

    afficherA("/profil");

    const lien = await screen.findByRole("link", { name: "Télécharger mes données" });
    expect(lien).toHaveAttribute("href", "/api/comptes/moi/export");
    expect(lien).toHaveAttribute("download");
  });

  it("supprime le compte après confirmation du mot de passe", async () => {
    const requetes = simulerApi({
      ...CONNECTE,
      "POST /comptes/moi/suppression": () => ({ statut: 204 }),
    });
    const utilisateur = userEvent.setup();
    const { router } = afficherA("/profil");

    await utilisateur.click(await screen.findByRole("button", { name: "Supprimer mon compte" }));
    const fenetre = await screen.findByRole("dialog", { name: "Supprimer ton compte ?" });
    await utilisateur.type(within(fenetre).getByLabelText("Mot de passe"), MOT_DE_PASSE);
    await utilisateur.click(
      within(fenetre).getByRole("button", { name: "Supprimer définitivement" }),
    );

    expect(await screen.findByText(/Ton compte a bien été supprimé/)).toBeVisible();
    expect(router.state.location.pathname).toBe("/connexion");
    const envoi = requetes.find((r) => r.cle === "POST /comptes/moi/suppression");
    expect(envoi?.corps).toEqual({ mot_de_passe: MOT_DE_PASSE });
    expect(envoi?.entetes.get("X-CSRF-Token")).toBe(MOI.jeton_csrf);
  });

  it("affiche le refus de l'API dans la fenêtre", async () => {
    simulerApi({
      ...CONNECTE,
      "POST /comptes/moi/suppression": () => ({
        statut: 409,
        corps: { detail: "Tu es le seul admin : nomme un autre admin avant." },
      }),
    });
    const utilisateur = userEvent.setup();
    afficherA("/profil");

    await utilisateur.click(await screen.findByRole("button", { name: "Supprimer mon compte" }));
    const fenetre = await screen.findByRole("dialog");
    await utilisateur.type(within(fenetre).getByLabelText("Mot de passe"), MOT_DE_PASSE);
    await utilisateur.click(
      within(fenetre).getByRole("button", { name: "Supprimer définitivement" }),
    );

    expect(await within(fenetre).findByRole("alert")).toHaveTextContent("seul admin");
  });
});
