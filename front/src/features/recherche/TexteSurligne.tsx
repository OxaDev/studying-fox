import type { Segment } from "./api";

/** Affiche un texte en surlignant les mots trouvés par la recherche. */
export function TexteSurligne({ segments }: { segments: Segment[] }) {
  return segments.map((segment, index) =>
    segment.surligne ? <mark key={index}>{segment.texte}</mark> : segment.texte,
  );
}
