import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
// La version DOM sait appliquer une navigation tout de suite (option `flushSync`).
import { RouterProvider } from "react-router/dom";

import { creerQueryClient } from "./api/queryClient";
import { initialiserTheme } from "./composants/theme";
import { routes } from "./routes";
import "./styles/global.css";

// Avant le premier affichage, pour ne pas montrer l'autre thème un instant.
initialiserTheme();

const racine = document.getElementById("racine");
if (!racine) throw new Error("Élément #racine introuvable dans index.html");

const queryClient = creerQueryClient();
const router = createBrowserRouter(routes, { basename: "/app" });

createRoot(racine).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
