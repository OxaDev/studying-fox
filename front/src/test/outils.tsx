import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import axe from "axe-core";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { vi } from "vitest";

import type { Schemas } from "../api/client";
import { creerQueryClient } from "../api/queryClient";
import { ContexteExecuteur } from "../features/execution/contexte";
import type { Executeur } from "../features/execution/executeur";
import { routes } from "../routes";

/** Affiche l'application à une adresse donnée (relative à /app). */
export function afficherA(adresse: string, executeur?: Pick<Executeur, "executer">) {
  const router = createMemoryRouter(routes, { initialEntries: [adresse] });
  const application = (
    <QueryClientProvider client={creerQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  const rendu = render(
    executeur ? (
      <ContexteExecuteur.Provider value={executeur}>{application}</ContexteExecuteur.Provider>
    ) : (
      application
    ),
  );
  return { ...rendu, router };
}

/** Liste les violations d'accessibilité détectées par axe (ADR 0013). */
export async function violationsAxe(conteneur: Element): Promise<string[]> {
  const resultat = await axe.run(conteneur, {
    // jsdom ne calcule pas les couleurs : le contraste est vérifié par Playwright.
    rules: { "color-contrast": { enabled: false } },
  });
  return resultat.violations.map((v) => `${v.id} : ${v.help}`);
}

// --- Simulation de l'API -----------------------------------------------------------------

interface Requete {
  cle: string;
  corps: unknown;
  entetes: Headers;
}

type Gestionnaire = (requete: Requete) => { statut: number; corps?: unknown };

export const MOI: Schemas["Moi"] = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "aiko@exemple.fr",
  pseudo: "aiko",
  role: "apprenant",
  licence_acceptee: false,
  jeton_csrf: "jeton-csrf-de-test",
};

export const CONNECTE: Record<string, Gestionnaire> = {
  "GET /comptes/moi": () => ({ statut: 200, corps: MOI }),
};

/** Sans ces réglages, l'appli suppose qu'il n'y a pas de vérification de l'email (ADR 0023). */
export const AVEC_VERIFICATION: Record<string, Gestionnaire> = {
  "GET /comptes/reglages": () => ({ statut: 200, corps: { verification_email: true } }),
};

export const NON_CONNECTE: Record<string, Gestionnaire> = {
  "GET /comptes/moi": () => ({ statut: 401, corps: { detail: "Connexion requise." } }),
};

/**
 * Remplace fetch. Les clés sont « MÉTHODE /chemin » (sans /api).
 * Renvoie la liste des requêtes reçues, pour les vérifier.
 */
export function simulerApi(gestionnaires: Record<string, Gestionnaire>): Requete[] {
  const requetes: Requete[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const chemin = url.replace(/^\/api/, "");
      const requete: Requete = {
        cle: `${init?.method ?? "GET"} ${chemin}`,
        corps: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        entetes: new Headers(init?.headers),
      };
      requetes.push(requete);
      // Sans gestionnaire pour l'adresse exacte, on essaie sans les paramètres (?q=…).
      const gestionnaire =
        gestionnaires[requete.cle] ?? gestionnaires[requete.cle.split("?")[0] ?? ""];
      const { statut, corps } = gestionnaire
        ? gestionnaire(requete)
        : { statut: 404, corps: { detail: `Pas de simulation pour ${requete.cle}` } };
      return Promise.resolve(
        new Response(corps === undefined ? null : JSON.stringify(corps), {
          status: statut,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }),
  );
  return requetes;
}

export const LECON: Schemas["LeconPubliee"] = {
  slug: "afficher-du-texte",
  titre: "Afficher du texte",
  resume: "Utiliser print pour afficher un message.",
  theme: { slug: "python", nom: "Python" },
  niveau: "debutant",
  duree_minutes: 5,
  objectifs: ["Afficher un message avec print"],
  contenu: [
    "Pour **afficher** un message, on utilise `print`.",
    "",
    "```python run",
    'print("Bonjour !")',
    "```",
    "",
    "> [!astuce]",
    "> Modifie le texte, puis relance le code.",
  ].join("\n"),
  assiste_par_ia: true,
  auteurs: ["aiko", "kitsune"],
  publiee_le: "2026-10-05T10:00:00Z",
  terminee: false,
};

export const PARCOURS: Schemas["ParcoursDetail"] = {
  slug: "premiers-pas",
  titre: "Premiers pas en Python",
  description: "Les bases de Python, pas à pas.",
  niveau: "debutant",
  theme: { slug: "python", nom: "Python" },
  nb_lecons: 3,
  nb_terminees: 1,
  duree_minutes: 20,
  lecons: [
    { slug: "installer", titre: "Installer Python", duree_minutes: 5, terminee: true },
    { slug: LECON.slug, titre: LECON.titre, duree_minutes: 5, terminee: false },
    { slug: "variables", titre: "Les variables", duree_minutes: 10, terminee: false },
  ],
  prochaine_lecon: LECON.slug,
};

const RESUME_PARCOURS: Schemas["ResumeParcours"] = {
  slug: PARCOURS.slug,
  titre: PARCOURS.titre,
  description: PARCOURS.description,
  niveau: PARCOURS.niveau,
  theme: PARCOURS.theme,
  nb_lecons: PARCOURS.nb_lecons,
  nb_terminees: PARCOURS.nb_terminees,
  duree_minutes: PARCOURS.duree_minutes,
};

export const PARCOURS_JS: Schemas["ResumeParcours"] = {
  ...RESUME_PARCOURS,
  slug: "javascript",
  titre: "Découvrir JavaScript",
  theme: { slug: "javascript", nom: "JavaScript" },
  nb_terminees: 0,
};

export const ESPACE: Schemas["Espace"] = {
  lecons_terminees: 1,
  pourcentage: 33,
  parcours_en_cours: [RESUME_PARCOURS],
  parcours_termines: [],
};

export const AVEC_LECON: Record<string, Gestionnaire> = {
  ...CONNECTE,
  "GET /lecons": () => ({ statut: 200, corps: [LECON] }),
  [`GET /lecons/${LECON.slug}`]: () => ({ statut: 200, corps: LECON }),
  "GET /parcours": () => ({ statut: 200, corps: [RESUME_PARCOURS, PARCOURS_JS] }),
  [`GET /parcours/${PARCOURS.slug}`]: () => ({ statut: 200, corps: PARCOURS }),
  "GET /progression": () => ({ statut: 200, corps: ESPACE }),
};

// --- Relecture ---------------------------------------------------------------------------

export const RELECTRICE: Schemas["Moi"] = { ...MOI, pseudo: "relectrice", role: "relecteur" };

export const REVISION: Schemas["RevisionARelire"] = {
  revision_id: "00000000-0000-0000-0000-0000000000aa",
  lecon_slug: LECON.slug,
  numero: 1,
  statut: "brouillon",
  titre: LECON.titre,
  resume: LECON.resume,
  objectifs: LECON.objectifs,
  duree_minutes: 5,
  contenu: LECON.contenu,
  theme: LECON.theme,
  niveau: "debutant",
  auteur: "relectrice",
  assiste_par_ia: true,
  fichier_importe: "exemple.json",
  a_relire: true,
  peut_publier: true,
  historique: [
    {
      revision_id: "00000000-0000-0000-0000-0000000000aa",
      numero: 1,
      statut: "brouillon",
      auteur: "relectrice",
      cree_le: "2026-10-05T10:00:00Z",
      publiee_le: null,
      en_ligne: false,
      decisions: [],
    },
  ],
};

export const ANALYSE: Schemas["ResultatAnalyse"] = {
  valide: true,
  erreurs: [],
  lecons: [
    {
      slug: LECON.slug,
      titre: LECON.titre,
      theme: "python",
      action: "creation",
      nb_images: 0,
    },
  ],
  parcours: null,
  codes: [
    {
      lecon: LECON.slug,
      bloc: 2,
      langage: "python",
      code: 'print("Bonjour !")',
      sortie_attendue: "Bonjour !\n",
      solution: false,
    },
  ],
  assiste_par_ia: true,
  outil: "Claude",
};

export const AVEC_RELECTURE: Record<string, Gestionnaire> = {
  ...AVEC_LECON,
  "GET /comptes/moi": () => ({ statut: 200, corps: RELECTRICE }),
  "GET /relecture": () => ({
    statut: 200,
    corps: [
      {
        revision_id: REVISION.revision_id,
        lecon_slug: LECON.slug,
        titre: LECON.titre,
        numero: 1,
        statut: "brouillon",
        auteur: "relectrice",
        assiste_par_ia: true,
        fichier_importe: "exemple.json",
        cree_le: "2026-10-05T10:00:00Z",
        peut_publier: true,
      },
    ],
  }),
  [`GET /relecture/${REVISION.revision_id}`]: () => ({ statut: 200, corps: REVISION }),
};

// --- Contribution ------------------------------------------------------------------------

export const CONTRIBUTRICE: Schemas["Moi"] = { ...MOI, pseudo: "aiko", role: "contributeur" };

export const CONTRIBUTION: Schemas["Contribution"] = {
  revision_id: "00000000-0000-0000-0000-0000000000cc",
  lecon_slug: "les-boucles",
  numero: 1,
  statut: "brouillon",
  titre: "Les boucles",
  resume: "",
  objectifs: [],
  duree_minutes: 10,
  contenu: "",
  theme: { slug: "python", nom: "Python" },
  niveau: "debutant",
  nouvelle_lecon: true,
  modifiee_le: "2026-10-05T10:00:00Z",
  retours: [],
};

export const AVEC_CONTRIBUTION: Record<string, Gestionnaire> = {
  ...AVEC_LECON,
  "GET /comptes/moi": () => ({ statut: 200, corps: CONTRIBUTRICE }),
  "GET /lecons/themes": () => ({
    statut: 200,
    corps: [
      { slug: "javascript", nom: "JavaScript" },
      { slug: "python-bases", nom: "Python - Bases" },
      { slug: "python-django", nom: "Python - Django" },
    ],
  }),
  "GET /contributions": () => ({
    statut: 200,
    corps: [
      {
        revision_id: CONTRIBUTION.revision_id,
        lecon_slug: CONTRIBUTION.lecon_slug,
        titre: CONTRIBUTION.titre,
        numero: 1,
        statut: "brouillon",
        nouvelle_lecon: true,
        modifiee_le: CONTRIBUTION.modifiee_le,
      },
    ],
  }),
  [`GET /contributions/${CONTRIBUTION.revision_id}`]: () => ({ statut: 200, corps: CONTRIBUTION }),
};

// --- Recherche ---------------------------------------------------------------------------

export const RESULTATS: Schemas["Resultats"] = {
  parcours: [
    {
      ...RESUME_PARCOURS,
      description: [
        { texte: "Les bases de Python, des variables aux ", surligne: false },
        { texte: "fonctions", surligne: true },
        { texte: ".", surligne: false },
      ],
    },
  ],
  lecons: [
    {
      slug: "les-fonctions",
      titre: "Les fonctions",
      theme: { slug: "python", nom: "Python" },
      niveau: "intermediaire",
      duree_minutes: 10,
      terminee: true,
      resume: [
        { texte: "Découper son code avec des ", surligne: false },
        { texte: "fonctions", surligne: true },
        { texte: ".", surligne: false },
      ],
      extrait: [
        { texte: "Le mot-clé def crée une ", surligne: false },
        { texte: "fonction", surligne: true },
      ],
    },
  ],
};

export const AVEC_RECHERCHE: Record<string, Gestionnaire> = {
  ...AVEC_LECON,
  "GET /lecons/themes": () => ({
    statut: 200,
    corps: [
      { slug: "javascript", nom: "JavaScript" },
      { slug: "python", nom: "Python" },
    ],
  }),
  "GET /recherche": () => ({ statut: 200, corps: RESULTATS }),
};

// --- Administration ----------------------------------------------------------------------

export const ADMIN: Schemas["Moi"] = { ...MOI, pseudo: "chef", role: "admin" };

export const UTILISATEURS: Schemas["PageUtilisateurs"] = {
  total: 2,
  utilisateurs: [
    {
      id: "00000000-0000-0000-0000-000000000002",
      email: "kitsune@exemple.fr",
      pseudo: "kitsune",
      role: "apprenant",
      email_verifie: true,
      suspendu: false,
      cree_le: "2026-10-05T10:00:00Z",
    },
    {
      id: ADMIN.id,
      email: ADMIN.email,
      pseudo: ADMIN.pseudo,
      role: "admin",
      email_verifie: true,
      suspendu: false,
      cree_le: "2026-10-01T10:00:00Z",
    },
  ],
};

export const THEMES_ADMIN: Schemas["ThemeAdmin"][] = [
  { slug: "python", nom: "Python", nb_lecons: 3, nb_parcours: 1 },
  { slug: "sql", nom: "SQL", nb_lecons: 0, nb_parcours: 0 },
];

export const JOURNAL: Schemas["PageJournal"] = {
  total: 1,
  actions: [
    {
      id: 1,
      action: "changement_role",
      acteur: "chef",
      cible: "kitsune",
      details: { avant: "apprenant", apres: "contributeur" },
      cree_le: "2026-10-05T11:00:00Z",
    },
  ],
};

export const AVEC_ADMIN: Record<string, Gestionnaire> = {
  ...AVEC_LECON,
  "GET /comptes/moi": () => ({ statut: 200, corps: ADMIN }),
  "GET /admin/utilisateurs": () => ({ statut: 200, corps: UTILISATEURS }),
  "GET /admin/themes": () => ({ statut: 200, corps: THEMES_ADMIN }),
  "GET /admin/journal": () => ({ statut: 200, corps: JOURNAL }),
};
