/**
 * Extension Markdown pour les encadrés (docs/markdown-lecons.md) :
 *
 *   > [!astuce]
 *   > Modifie le texte puis relance le code.
 *
 * La citation devient un <div data-encadre="astuce">, affiché par le composant Encadre.
 * Le marqueur [!exercice] crée de la même façon un exercice (voir Exercice.tsx).
 */
import type { Blockquote, Root } from "mdast";
import { visit } from "unist-util-visit";

export const VARIANTES = {
  astuce: "Astuce",
  attention: "Attention",
  a_retenir: "À retenir",
} as const;

export type Variante = keyof typeof VARIANTES;

const MARQUEUR = /^\[!(astuce|attention|a_retenir|exercice)\]\s*/;

function variante(citation: Blockquote): Variante | "exercice" | null {
  const paragraphe = citation.children[0];
  const texte = paragraphe?.type === "paragraph" ? paragraphe.children[0] : undefined;
  if (texte?.type !== "text") return null;
  const trouve = MARQUEUR.exec(texte.value);
  if (!trouve?.[1]) return null;
  texte.value = texte.value.slice(trouve[0].length);
  return trouve[1] as Variante | "exercice";
}

export function remarqueEncadres() {
  return (arbre: Root) => {
    visit(arbre, "blockquote", (citation: Blockquote) => {
      const nom = variante(citation);
      if (nom) {
        citation.data = { hName: "div", hProperties: { dataEncadre: nom } };
      }
    });
  };
}
