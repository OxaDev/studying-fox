/**
 * Page d'aperçu des illustrations, ouverte par `npm run illustration` (scripts/apercu-illustrations.ts).
 * Elle affiche chaque illustration avec le vrai rendu des leçons, dans le thème demandé.
 * Elle n'est servie que par le serveur de dev : le build de l'application ne l'inclut pas.
 */
import { createRoot } from "react-dom/client";

import "../../../styles/global.css";
import { Markdown } from "../Markdown";
import type { IllustrationDuPaquet } from "./paquet";

declare global {
  interface Window {
    afficherIllustrations?: (liste: IllustrationDuPaquet[], theme: "light" | "dark") => void;
  }
}

const racine = document.getElementById("racine");
if (!racine) throw new Error("Élément #racine introuvable");
const rendu = createRoot(racine);

window.afficherIllustrations = (liste, theme) => {
  document.documentElement.dataset.theme = theme;
  rendu.render(
    <main data-pret="">
      {liste.map((illustration, index) => (
        <section key={illustration.nom} data-illustration={index} style={{ padding: "1rem" }}>
          <h2>{illustration.emplacement}</h2>
          <Markdown
            contenu={`\`\`\`\`illustration ${illustration.legende ?? ""}\n${illustration.svg}\n\`\`\`\`\n`}
          />
        </section>
      ))}
    </main>,
  );
};
