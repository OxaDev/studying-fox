import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { basicSetup, EditorView } from "codemirror";
import { useEffect, useRef } from "react";

import type { Langage } from "./types";

// Couleurs des jetons de tokens.css : contrastes vérifiés en thème clair et sombre.
const coloration = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.controlKeyword], color: "var(--code-mot-cle)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--code-chaine)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--code-nombre)" },
  { tag: tags.comment, color: "var(--code-commentaire)", fontStyle: "italic" },
  {
    tag: [tags.function(tags.variableName), tags.definition(tags.variableName)],
    color: "var(--code-fonction)",
  },
]);

const theme = EditorView.theme({
  "&": { backgroundColor: "var(--surface)", color: "var(--texte)", fontSize: "1rem" },
  "&.cm-focused": { outline: "3px solid var(--primaire)", outlineOffset: "2px" },
  ".cm-content": { fontFamily: "var(--police-code)", caretColor: "var(--texte)" },
  ".cm-gutters": {
    backgroundColor: "var(--surface)",
    color: "var(--texte-doux)",
    borderRight: "1px solid var(--bordure)",
  },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--code-ligne-active)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "var(--code-selection)",
  },
  ".cm-cursor": { borderLeftColor: "var(--texte)" },
});

interface Props {
  valeur: string;
  langage: Langage | "markdown";
  label: string;
  onChange: (valeur: string) => void;
  /** Donne accès à l'éditeur, par exemple pour insérer du texte au curseur. */
  surVue?: (vue: EditorView | null) => void;
  /** Identifiant d'une aide associée (aria-describedby). */
  idDescription?: string;
}

const MODES = { python, javascript, markdown };

/**
 * Éditeur de code accessible. La touche Tab n'est pas capturée :
 * on peut toujours quitter l'éditeur au clavier (RGAA 12.9).
 */
export function EditeurCode({ valeur, langage, label, onChange, surVue, idDescription }: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const vue = useRef<EditorView | null>(null);
  const surChangement = useRef(onChange);
  const valeurInitiale = useRef(valeur);
  const surVueRef = useRef(surVue);

  useEffect(() => {
    surChangement.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!conteneur.current) return;
    const editeur = new EditorView({
      parent: conteneur.current,
      doc: valeurInitiale.current,
      extensions: [
        basicSetup,
        MODES[langage](),
        // Les longues lignes de texte passent à la ligne (Markdown).
        ...(langage === "markdown" ? [EditorView.lineWrapping] : []),
        syntaxHighlighting(coloration),
        theme,
        EditorView.contentAttributes.of({
          "aria-label": label,
          ...(idDescription ? { "aria-describedby": idDescription } : {}),
        }),
        EditorView.updateListener.of((miseAJour) => {
          if (miseAJour.docChanged) surChangement.current(miseAJour.state.doc.toString());
        }),
      ],
    });
    vue.current = editeur;
    const signaler = surVueRef.current;
    signaler?.(editeur);
    return () => {
      signaler?.(null);
      editeur.destroy();
      vue.current = null;
    };
  }, [langage, label, idDescription]);

  // Remise à zéro demandée de l'extérieur (bouton « Réinitialiser »).
  useEffect(() => {
    const editeur = vue.current;
    if (editeur && editeur.state.doc.toString() !== valeur) {
      editeur.dispatch({ changes: { from: 0, to: editeur.state.doc.length, insert: valeur } });
    }
  }, [valeur]);

  return <div ref={conteneur} />;
}
