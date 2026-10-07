import { createElement, type CSSProperties, type ReactNode, useId, useMemo } from "react";
import { Button, Disclosure, DisclosurePanel } from "react-aria-components";

import { analyserSvg, type ElementSvg } from "./analyse";
import styles from "./Illustration.module.css";

const ATTRIBUTS_COULEUR = new Set(["fill", "stroke", "stop-color"]);
const SUR_LE_SVG = new Set(["viewBox", "preserveAspectRatio", "width", "height"]);

/** stroke-width devient strokeWidth, le nom qu'attend React. */
function enCamel(nom: string): string {
  return nom.replace(/-([a-z])/g, (_, lettre: string) => lettre.toUpperCase());
}

/**
 * Recrée l'illustration en éléments React, à partir de l'arbre déjà contrôlé : jamais d'innerHTML.
 * Les identifiants reçoivent un préfixe propre à l'illustration, pour que deux illustrations
 * de la même page ne se partagent pas un marqueur ou un dégradé.
 */
function rendre(element: ElementSvg, prefixe: string, cle?: number): ReactNode {
  const proprietes: Record<string, string | number | CSSProperties> = {};
  const style: Record<string, string> = {};
  if (cle !== undefined) proprietes.key = cle;
  for (const [nom, valeur] of element.attributs) {
    const prefixee = valeur.replace(/^url\(#/, `url(#${prefixe}`);
    if (nom === "id") proprietes.id = prefixe + valeur;
    else if (nom === "href") proprietes.href = `#${prefixe}${valeur.slice(1)}`;
    else if (ATTRIBUTS_COULEUR.has(nom)) {
      // Un nom de la palette devient le jeton du même nom : il suit le thème (ADR 0024).
      style[enCamel(nom)] =
        valeur === "none" || prefixee !== valeur ? prefixee : `var(--${valeur})`;
    } else proprietes[enCamel(nom)] = prefixee;
  }
  if (Object.keys(style).length > 0) proprietes.style = style;
  const enfants = element.enfants.map((enfant, index) =>
    typeof enfant === "string" ? enfant : rendre(enfant, prefixe, index),
  );
  return createElement(element.nom, proprietes, ...enfants);
}

interface Props {
  /** Le SVG, avec son <title> (texte alternatif) et son <desc> (description détaillée). */
  source: string;
  legende?: string;
}

/** Une illustration vectorielle (ADR 0029), contrôlée par la liste blanche avant d'être affichée. */
export function Illustration({ source, legende }: Props) {
  const analyse = useMemo(() => analyserSvg(source, new DOMParser()), [source]);
  const id = useId();
  const prefixe = `illustration-${id.replace(/[^A-Za-z0-9_-]/g, "")}-`;

  if (!analyse.valide) {
    return (
      <div className={styles.invalide}>
        <p className={styles.titreInvalide}>Cette illustration ne peut pas s'afficher.</p>
        <ul>
          {analyse.erreurs.map((erreur) => (
            <li key={erreur}>{erreur}</li>
          ))}
        </ul>
      </div>
    );
  }

  const { svg, titre, description } = analyse;
  const idTitre = `${prefixe}titre`;
  // La taille vient de la feuille de style. Les autres attributs du <svg> (police, couleur par
  // défaut…) passent sur un groupe. Le titre et la description sont affichés par nos soins.
  const viewBox = svg.attributs.find(([nom]) => nom === "viewBox")?.[1];
  const ratio = svg.attributs.find(([nom]) => nom === "preserveAspectRatio")?.[1];
  const attributs = svg.attributs.filter(([nom]) => !SUR_LE_SVG.has(nom));
  const enfants = svg.enfants.filter(
    (enfant) => typeof enfant === "string" || (enfant.nom !== "title" && enfant.nom !== "desc"),
  );
  const contenu = rendre({ nom: "g", attributs, enfants }, prefixe);

  return (
    <div className={styles.illustration}>
      <figure className={styles.figure}>
        <svg
          viewBox={viewBox}
          preserveAspectRatio={ratio}
          role="img"
          aria-labelledby={idTitre}
          className={styles.svg}
        >
          <title id={idTitre}>{titre}</title>
          {contenu}
        </svg>
        {legende && <figcaption className={styles.legende}>{legende}</figcaption>}
      </figure>
      <Disclosure className={styles.description}>
        <Button slot="trigger" className={styles.boutonDescription}>
          Description de l'illustration
        </Button>
        <DisclosurePanel>
          <p>{description}</p>
        </DisclosurePanel>
      </Disclosure>
    </div>
  );
}
