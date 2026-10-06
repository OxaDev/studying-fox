import {
  acceptCompletion,
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState, Prec } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useId, useRef } from "react";

import styles from "./EditeurCode.module.css";
import type { Langage } from "./types";
import { vba } from "./vba/langage";

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

/**
 * Le thème remplace toutes les couleurs du thème de base de CodeMirror, qui sont
 * en dur et prévues pour un fond clair (blanc sur blanc en thème sombre).
 * Certains sélecteurs reprennent ceux du thème de base pour l'emporter sur eux.
 */
const theme = EditorView.theme({
  "&": { backgroundColor: "var(--surface)", color: "var(--texte)", fontSize: "1rem" },
  "&.cm-focused": { outline: "3px solid var(--primaire)", outlineOffset: "2px" },
  // Sur le défileur, et pas seulement le contenu : les numéros de ligne gardent la même hauteur.
  ".cm-scroller": { fontFamily: "var(--police-code)", lineHeight: "1.5" },
  ".cm-content": { caretColor: "var(--texte)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--texte)" },
  ".cm-gutters": {
    backgroundColor: "var(--surface)",
    color: "var(--texte-doux)",
    borderRight: "1px solid var(--bordure)",
  },
  // Ligne active seulement quand on écrit : sinon chaque bloc de la page en montrerait une.
  "&.cm-focused .cm-activeLine, &.cm-focused .cm-activeLineGutter": {
    backgroundColor: "var(--code-ligne-active)",
  },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
  // La ligne active est opaque : elle masquerait la sélection, dessinée dessous.
  "&:has(.cm-selectionBackground) .cm-activeLine": { backgroundColor: "transparent" },
  ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
    { backgroundColor: "var(--code-selection)" },
  // Autres occurrences du texte sélectionné, résultats de recherche.
  ".cm-selectionMatch, .cm-searchMatch": { backgroundColor: "var(--surlignage)" },
  ".cm-searchMatch-selected": { outline: "2px solid var(--primaire)" },
  "&.cm-focused .cm-matchingBracket": {
    backgroundColor: "transparent",
    outline: "1px solid var(--primaire)",
  },
  "&.cm-focused .cm-nonmatchingBracket": {
    backgroundColor: "transparent",
    color: "var(--erreur)",
    outline: "1px solid var(--erreur)",
  },
  ".cm-specialChar": { color: "var(--erreur)" },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--fond)",
    border: "1px solid var(--bordure)",
    color: "var(--texte)",
  },
  // Suggestions de l'autocomplétion et autres bulles.
  ".cm-tooltip": {
    backgroundColor: "var(--surface)",
    color: "var(--texte)",
    border: "1px solid var(--bordure)",
    borderRadius: "8px",
    boxShadow: "var(--ombre)",
  },
  // La liste ne défile pas (on y navigue avec les flèches depuis l'éditeur) :
  // une zone qui défile devrait sinon pouvoir recevoir le focus (RGAA 7.3).
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    maxHeight: "none",
    overflowY: "visible",
    fontFamily: "var(--police-code)",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { padding: "var(--esp-1) var(--esp-2)" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    background: "var(--primaire)",
    color: "var(--sur-primaire)",
  },
  ".cm-completionIcon": { opacity: "1" },
  ".cm-completionMatchedText": { textDecoration: "underline", fontWeight: "700" },
  ".cm-completionDetail": { fontStyle: "italic" },
  ".cm-tooltip .cm-tooltip-arrow:before": {
    borderTopColor: "var(--bordure)",
    borderBottomColor: "var(--bordure)",
  },
  ".cm-tooltip .cm-tooltip-arrow:after": {
    borderTopColor: "var(--surface)",
    borderBottomColor: "var(--surface)",
  },
  // Panneau de recherche (Ctrl+F dans l'éditeur).
  ".cm-panels": { backgroundColor: "var(--fond)", color: "var(--texte)" },
  ".cm-panels-top": { borderBottom: "1px solid var(--bordure)" },
  ".cm-panels-bottom": { borderTop: "1px solid var(--bordure)" },
  ".cm-textfield": {
    backgroundColor: "var(--surface)",
    color: "var(--texte)",
    border: "1px solid var(--bordure)",
  },
  ".cm-button": {
    backgroundImage: "none",
    backgroundColor: "var(--surface)",
    color: "var(--texte)",
    border: "1px solid var(--bordure)",
  },
  ".cm-button:active": { backgroundImage: "none", backgroundColor: "var(--survol-secondaire)" },
  ".cm-panel button[name=close]": { color: "var(--texte)" },
  ".cm-textfield:focus-visible, .cm-button:focus-visible, .cm-panel input[type=checkbox]:focus-visible":
    { outline: "3px solid var(--primaire)", outlineOffset: "1px" },
});

/**
 * Clavier comme dans un IDE : Tab valide la suggestion affichée, sinon indente ;
 * Entrée va toujours à la ligne. Échap puis Tab quitte l'éditeur (RGAA 12.9),
 * comme le prévoit CodeMirror.
 */
const clavier = [
  // En premier : quand la liste est ouverte, les flèches parcourent les suggestions.
  Prec.highest(
    keymap.of([
      { key: "Tab", run: acceptCompletion },
      ...completionKeymap.filter((raccourci) => raccourci.key !== "Enter"),
    ]),
  ),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    indentWithTab,
  ]),
];

// Textes lus par les lecteurs d'écran ou affichés par CodeMirror.
const traductions = EditorState.phrases.of({
  Completions: "Suggestions",
  "Control character": "Caractère de contrôle",
  "Selection deleted": "Sélection supprimée",
  "folded code": "code replié",
  unfold: "déplier",
  "Fold line": "Replier les lignes",
  "Unfold line": "Déplier les lignes",
  "Folded lines": "Lignes repliées",
  "Unfolded lines": "Lignes dépliées",
  to: "à",
  Find: "Rechercher",
  Replace: "Remplacer",
  next: "suivant",
  previous: "précédent",
  all: "tout",
  "match case": "respecter la casse",
  regexp: "expression régulière",
  "by word": "mot entier",
  replace: "remplacer",
  "replace all": "tout remplacer",
  close: "fermer",
  "current match": "résultat courant",
  "on line": "à la ligne",
  "replaced match on line $": "remplacé à la ligne $",
  "replaced $ matches": "$ remplacements",
  "Go to line": "Aller à la ligne",
  go: "aller",
});

const SUGGESTIONS_AFFICHEES = 8;

/** Maj+Entrée exécute le code, comme dans Jupyter, même si des suggestions sont ouvertes. */
function raccourciExecution(executer: () => void) {
  return Prec.highest(
    keymap.of([
      {
        key: "Shift-Enter",
        run: () => {
          executer();
          return true;
        },
      },
    ]),
  );
}

/** Équivalent de `basicSetup`, avec le clavier ci-dessus. */
const configuration = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  autocompletion({ defaultKeymap: false, maxRenderedOptions: SUGGESTIONS_AFFICHEES }),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  clavier,
  traductions,
];

interface Props {
  valeur: string;
  langage: Langage | "markdown";
  label: string;
  onChange: (valeur: string) => void;
  /** Donne accès à l'éditeur, par exemple pour insérer du texte au curseur. */
  surVue?: (vue: EditorView | null) => void;
  /** Identifiant d'une aide associée (aria-describedby). */
  idDescription?: string;
  /** Lancé par Maj+Entrée. Sans lui, Maj+Entrée va à la ligne. */
  surExecution?: () => void;
}

const MODES = { python, javascript, vba, markdown };
// Python : 4 espaces (PEP 8). VBA : 4, comme l'éditeur d'Excel. JavaScript et Markdown : 2.
const INDENTATION = { python: "    ", javascript: "  ", vba: "    ", markdown: "  " };

/**
 * Éditeur de code accessible. Tab indente comme dans un IDE ; une aide visible
 * indique comment quitter l'éditeur au clavier (Échap puis Tab).
 */
export function EditeurCode({
  valeur,
  langage,
  label,
  onChange,
  surVue,
  idDescription,
  surExecution,
}: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const vue = useRef<EditorView | null>(null);
  const surChangement = useRef(onChange);
  const valeurInitiale = useRef(valeur);
  const surVueRef = useRef(surVue);
  const executer = useRef(surExecution);
  const executable = surExecution !== undefined;
  const idAide = useId();
  const description = idDescription ? `${idAide} ${idDescription}` : idAide;

  useEffect(() => {
    surChangement.current = onChange;
  }, [onChange]);

  useEffect(() => {
    executer.current = surExecution;
  }, [surExecution]);

  useEffect(() => {
    if (!conteneur.current) return;
    const editeur = new EditorView({
      parent: conteneur.current,
      doc: valeurInitiale.current,
      extensions: [
        ...(executable ? [raccourciExecution(() => executer.current?.())] : []),
        configuration,
        MODES[langage](),
        indentUnit.of(INDENTATION[langage]),
        // Les longues lignes de texte passent à la ligne (Markdown).
        ...(langage === "markdown" ? [EditorView.lineWrapping] : []),
        syntaxHighlighting(coloration),
        theme,
        EditorView.contentAttributes.of({ "aria-label": label, "aria-describedby": description }),
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
  }, [langage, label, description, executable]);

  // Remise à zéro demandée de l'extérieur (bouton « Réinitialiser »).
  useEffect(() => {
    const editeur = vue.current;
    if (editeur && editeur.state.doc.toString() !== valeur) {
      editeur.dispatch({ changes: { from: 0, to: editeur.state.doc.length, insert: valeur } });
    }
  }, [valeur]);

  return (
    <>
      <div ref={conteneur} />
      <p id={idAide} className={styles.aide}>
        Tab indente ou valide une suggestion.{executable && " Maj+Entrée exécute le code."} Pour
        quitter l&apos;éditeur : Échap, puis Tab.
      </p>
    </>
  );
}
