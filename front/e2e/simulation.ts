import type { Page } from "@playwright/test";

/** L'API ne tourne pas pendant ces tests : on simule ses réponses. */

export const MOI = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "aiko@exemple.fr",
  pseudo: "aiko",
  role: "apprenant",
  licence_acceptee: false,
  jeton_csrf: "jeton",
};

export const LECON = {
  slug: "premiers-pas",
  titre: "Premiers pas",
  resume: "Afficher du texte en Python et en JavaScript.",
  theme: { slug: "python", nom: "Python" },
  niveau: "debutant",
  duree_minutes: 5,
  objectifs: ["Afficher un message"],
  contenu: [
    "En Python :",
    "",
    "```python run",
    'prenom = "Aiko"',
    'print(f"Bonjour {prenom} !")',
    "```",
    "",
    "En JavaScript :",
    "",
    "```javascript run",
    'console.log("Bonjour depuis JavaScript");',
    "```",
    "",
    "En VBA, sur une feuille Excel :",
    "",
    "```vba run",
    "Sub Main()",
    '    Range("A1").Value = "Total"',
    '    Range("B1").Value = 12.5',
    '    Debug.Print "Bonjour depuis VBA"',
    "End Sub",
    "```",
    "",
    "> [!astuce]",
    "> Modifie le code, puis relance-le.",
    "",
    "> [!exercice]",
    "> Affiche le **double** de `n`.",
    ">",
    "> ```javascript run",
    "> const n = 21;",
    "> ```",
    ">",
    "> ```javascript solution",
    "> const n = 21;",
    "> console.log(n * 2);",
    "> ```",
  ].join("\n"),
  assiste_par_ia: false,
  auteurs: ["aiko"],
  publiee_le: "2026-10-05T10:00:00Z",
  terminee: false,
};

const RESUME_PARCOURS = {
  slug: "bases",
  titre: "Les bases de la programmation",
  description: "Afficher, stocker, décider : les premières briques.",
  niveau: "debutant",
  theme: { slug: "python", nom: "Python" },
  nb_lecons: 2,
  nb_terminees: 1,
  duree_minutes: 15,
};

export const PARCOURS = {
  ...RESUME_PARCOURS,
  lecons: [
    { slug: "installer", titre: "Installer Python", duree_minutes: 10, terminee: true },
    { slug: LECON.slug, titre: LECON.titre, duree_minutes: 5, terminee: false },
  ],
  prochaine_lecon: LECON.slug,
};

const ESPACE = {
  lecons_terminees: 1,
  pourcentage: 50,
  parcours_en_cours: [RESUME_PARCOURS],
  parcours_termines: [
    { ...RESUME_PARCOURS, slug: "fini", titre: "Parcours fini", nb_terminees: 2 },
  ],
};

export async function simulerSession(page: Page, connecte: boolean) {
  await page.route("**/api/comptes/moi", (route) =>
    route.fulfill(
      connecte ? { json: MOI } : { status: 401, json: { detail: "Connexion requise." } },
    ),
  );
}

export async function simulerLecons(page: Page) {
  await simulerSession(page, true);
  await page.route("**/api/lecons", (route) => route.fulfill({ json: [LECON] }));
  await page.route(`**/api/lecons/${LECON.slug}`, (route) => route.fulfill({ json: LECON }));
  await page.route("**/api/parcours", (route) =>
    route.fulfill({
      json: [
        RESUME_PARCOURS,
        { ...RESUME_PARCOURS, slug: "js", theme: { slug: "javascript", nom: "JavaScript" } },
      ],
    }),
  );
  await page.route(`**/api/parcours/${PARCOURS.slug}`, (route) =>
    route.fulfill({ json: PARCOURS }),
  );
  await page.route("**/api/progression", (route) => route.fulfill({ json: ESPACE }));
  await page.route("**/api/lecons/themes", (route) =>
    route.fulfill({ json: [{ slug: "python", nom: "Python" }] }),
  );
  await page.route(/\/api\/recherche(\?|$)/, (route) =>
    route.fulfill({
      json: {
        parcours: [
          {
            ...RESUME_PARCOURS,
            description: [
              { texte: "Afficher, stocker, décider : les premières ", surligne: false },
              { texte: "briques", surligne: true },
            ],
          },
        ],
        lecons: [
          {
            ...LECON,
            resume: [{ texte: LECON.resume, surligne: false }],
            extrait: [
              { texte: "Modifie le code, puis ", surligne: false },
              { texte: "relance", surligne: true },
            ],
          },
        ],
      },
    }),
  );
}

export const CONTRIBUTION = {
  revision_id: "00000000-0000-0000-0000-0000000000cc",
  lecon_slug: "les-boucles",
  numero: 1,
  statut: "brouillon",
  titre: "Les boucles",
  resume: "Répéter une action.",
  objectifs: ["Écrire une boucle"],
  duree_minutes: 10,
  contenu: "Une **boucle**.\n\n```python run\nprint(1)\n```\n\n> [!astuce]\n> Essaie !\n",
  theme: { slug: "python", nom: "Python" },
  niveau: "debutant",
  nouvelle_lecon: true,
  modifiee_le: "2026-10-05T10:00:00Z",
  retours: [],
};

export async function simulerContribution(page: Page) {
  await simulerLecons(page);
  await page.route("**/api/comptes/moi", (route) =>
    route.fulfill({ json: { ...MOI, pseudo: "aiko", role: "contributeur" } }),
  );
  await page.route("**/api/lecons/themes", (route) =>
    route.fulfill({ json: [{ slug: "python", nom: "Python" }] }),
  );
  await page.route("**/api/contributions", (route) =>
    route.fulfill({
      json: [
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
  );
  await page.route(`**/api/contributions/${CONTRIBUTION.revision_id}`, (route) =>
    route.fulfill({ json: CONTRIBUTION }),
  );
}

export async function simulerAdmin(page: Page) {
  await simulerLecons(page);
  await page.route("**/api/comptes/moi", (route) =>
    route.fulfill({ json: { ...MOI, pseudo: "chef", role: "admin" } }),
  );
  await page.route(/\/api\/admin\/utilisateurs(\?|$)/, (route) =>
    route.fulfill({
      json: {
        total: 2,
        utilisateurs: [
          {
            id: "00000000-0000-0000-0000-000000000002",
            email: "kitsune@exemple.fr",
            pseudo: "kitsune",
            role: "apprenant",
            email_verifie: false,
            suspendu: true,
            cree_le: "2026-10-05T10:00:00Z",
          },
          {
            id: MOI.id,
            email: MOI.email,
            pseudo: "chef",
            role: "admin",
            email_verifie: true,
            suspendu: false,
            cree_le: "2026-10-01T10:00:00Z",
          },
        ],
      },
    }),
  );
  await page.route("**/api/admin/themes", (route) =>
    route.fulfill({
      json: [
        { slug: "python", nom: "Python", nb_lecons: 3, nb_parcours: 1 },
        { slug: "sql", nom: "SQL", nb_lecons: 0, nb_parcours: 0 },
      ],
    }),
  );
  await page.route(/\/api\/admin\/journal(\?|$)/, (route) =>
    route.fulfill({
      json: {
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
      },
    }),
  );
}
