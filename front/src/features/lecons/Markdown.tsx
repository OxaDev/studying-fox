import type { Element, ElementContent } from "hast";
import { type ReactNode, useContext } from "react";
import ReactMarkdown, { type Components } from "react-markdown";

import { BlocCode } from "../execution/BlocCode";
import { remarqueEncadres, VARIANTES, type Variante } from "./encadres";
import { ContexteExercice, Exercice, Solution } from "./Exercice";
import styles from "./Markdown.module.css";

function texte(noeuds: ElementContent[]): string {
  return noeuds
    .map((noeud) => {
      if (noeud.type === "text") return noeud.value;
      if (noeud.type === "element") return texte(noeud.children);
      return "";
    })
    .join("");
}

/** Lit le langage et les options « run » ou « solution » d'un bloc ```python run. */
function lireBlocCode(pre: Element | undefined) {
  const code = pre?.children[0];
  if (code?.type !== "element" || code.tagName !== "code") return null;
  const classes = code.properties.className;
  const premiere = Array.isArray(classes) ? classes[0] : undefined;
  const classe = typeof premiere === "string" ? premiere : "";
  const meta = code.data?.meta ?? "";
  return {
    langage: classe.replace(/^language-/, ""),
    executable: /(^|\s)run(\s|$)/.test(meta),
    solution: /(^|\s)solution(\s|$)/.test(meta),
    code: texte(code.children).replace(/\n$/, ""),
  };
}

function Bloc({ node, children }: { node: Element | undefined; children: ReactNode }) {
  const dansExercice = useContext(ContexteExercice);
  const bloc = lireBlocCode(node);
  if (!bloc) return <pre>{children}</pre>;
  if (bloc.solution) return <Solution langage={bloc.langage} code={bloc.code} />;
  // La clé recrée le bloc si son code change (aperçu de l'éditeur de contribution).
  return (
    <BlocCode
      key={bloc.code}
      langage={bloc.langage}
      code={bloc.code}
      executable={bloc.executable}
      titre={dansExercice ? "À toi de jouer" : undefined}
    />
  );
}

type Titre = "h2" | "h3" | "h4" | "h5" | "h6";
const TITRES: Titre[] = ["h2", "h3", "h4", "h5", "h6"];

/** Le titre de la page est le seul h1 : les titres du Markdown commencent au niveau 2 + décalage. */
function titre(niveau: number, decalage: number): Components["h1"] {
  const Balise = TITRES[Math.min(niveau - 1 + decalage, TITRES.length - 1)] ?? "h6";
  return ({ children }) => <Balise>{children}</Balise>;
}

const composants: Components = {
  pre: ({ node, children }) => <Bloc node={node}>{children}</Bloc>,
  div: ({ node, children }) => {
    const variante = node?.properties.dataEncadre;
    if (variante === "exercice") return <Exercice>{children}</Exercice>;
    if (typeof variante !== "string" || !(variante in VARIANTES)) return <div>{children}</div>;
    return (
      <div className={styles.encadre} data-variante={variante}>
        <p className={styles.titreEncadre}>{VARIANTES[variante as Variante]}</p>
        {children}
      </div>
    );
  },
};

/**
 * Affiche le Markdown d'une leçon (ADR 0006). Le HTML brut n'est jamais interprété,
 * et les liens dangereux (javascript:…) sont neutralisés par react-markdown.
 */
export function Markdown({ contenu, decalage = 0 }: { contenu: string; decalage?: number }) {
  const avecTitres: Components = {
    ...composants,
    h1: titre(1, decalage),
    h2: titre(2, decalage),
    h3: titre(3, decalage),
    h4: titre(4, decalage),
  };
  return (
    <div className={styles.markdown}>
      <ReactMarkdown remarkPlugins={[remarqueEncadres]} components={avecTitres} skipHtml>
        {contenu}
      </ReactMarkdown>
    </div>
  );
}
