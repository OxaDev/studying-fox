import { Navigate, type RouteObject } from "react-router";

import { Gabarit } from "./composants/Gabarit";
import { GabaritPublic } from "./composants/GabaritPublic";
import { PageJournal } from "./features/admin/PageJournal";
import { PageThemes } from "./features/admin/PageThemes";
import { PageUtilisateurs } from "./features/admin/PageUtilisateurs";
import { ConnexionRequise } from "./features/comptes/ConnexionRequise";
import { PageConfirmation } from "./features/comptes/PageConfirmation";
import { PageConnexion } from "./features/comptes/PageConnexion";
import { PageInscription } from "./features/comptes/PageInscription";
import { PageMotDePasseOublie } from "./features/comptes/PageMotDePasseOublie";
import { PageProfil } from "./features/comptes/PageProfil";
import { PageReinitialisation } from "./features/comptes/PageReinitialisation";
import { RoleRequis } from "./features/comptes/RoleRequis";
import { PageIntrouvable } from "./features/erreurs/PageIntrouvable";
import { PageEspace } from "./features/espace/PageEspace";
import { PageLecons } from "./features/lecons/PageLecons";
import { PageListeParcours } from "./features/parcours/PageListeParcours";
import { PageParcours } from "./features/parcours/PageParcours";
import { PageContributions } from "./features/contribution/PageContributions";
import { PageNouvelleLecon } from "./features/contribution/PageNouvelleLecon";
import { PageRecherche } from "./features/recherche/PageRecherche";
import { PageRelecture } from "./features/relecture/PageRelecture";

async function chargerPageLecon() {
  return { Component: (await import("./features/lecons/PageLecon")).PageLecon };
}

// Adresses relatives à /app (ADR 0020).
export const routes: RouteObject[] = [
  {
    element: <GabaritPublic />,
    children: [
      { path: "connexion", element: <PageConnexion /> },
      { path: "inscription", element: <PageInscription /> },
      { path: "confirmation", element: <PageConfirmation /> },
      { path: "mot-de-passe-oublie", element: <PageMotDePasseOublie /> },
      { path: "reinitialisation", element: <PageReinitialisation /> },
      { path: "*", element: <PageIntrouvable /> },
    ],
  },
  {
    element: <ConnexionRequise />,
    children: [
      {
        element: <Gabarit />,
        children: [
          { index: true, element: <PageEspace /> },
          { path: "profil", element: <PageProfil /> },
          { path: "lecons", element: <PageLecons /> },
          { path: "parcours", element: <PageListeParcours /> },
          { path: "parcours/:parcours", element: <PageParcours /> },
          { path: "recherche", element: <PageRecherche /> },
          // Chargées à la demande : l'éditeur de code pèse lourd (cadrage § 6, performance).
          { path: "parcours/:parcours/:lecon", lazy: chargerPageLecon },
          { path: "lecons/:slug", lazy: chargerPageLecon },
          {
            path: "contributions",
            element: <RoleRequis minimum="contributeur" />,
            children: [
              { index: true, element: <PageContributions /> },
              { path: "nouvelle", element: <PageNouvelleLecon /> },
              {
                path: ":revisionId",
                // L'éditeur et l'aperçu embarquent CodeMirror : chargés à la demande.
                lazy: async () => ({
                  Component: (await import("./features/contribution/PageEditeur")).PageEditeur,
                }),
              },
            ],
          },
          {
            path: "admin",
            element: <RoleRequis minimum="admin" />,
            children: [
              { index: true, element: <Navigate to="utilisateurs" replace /> },
              { path: "utilisateurs", element: <PageUtilisateurs /> },
              { path: "themes", element: <PageThemes /> },
              { path: "journal", element: <PageJournal /> },
            ],
          },
          {
            path: "relecture",
            element: <RoleRequis minimum="relecteur" />,
            children: [
              { index: true, element: <PageRelecture /> },
              {
                path: "import",
                lazy: async () => ({
                  Component: (await import("./features/relecture/PageImport")).PageImport,
                }),
              },
              {
                path: ":revisionId",
                lazy: async () => ({
                  Component: (await import("./features/relecture/PageRevision")).PageRevision,
                }),
              },
            ],
          },
        ],
      },
    ],
  },
];
