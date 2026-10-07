/**
 * Les illustrations d'un paquet de leçons, pour les outils des rédacteurs :
 * `npm run verifier` les contrôle, `npm run illustration` en fait des captures.
 */
import { svgComplet } from "./analyse";

interface BlocDuPaquet {
  type: string;
  svg?: string;
  alt?: string;
  description?: string;
  legende?: string | null;
}

export interface PaquetAvecIllustrations {
  lecons: { slug: string; blocs: BlocDuPaquet[] }[];
}

export interface IllustrationDuPaquet {
  /** « slug › bloc N », pour situer l'illustration dans les messages. */
  emplacement: string;
  /** Nom de fichier sans extension, pour les captures. */
  nom: string;
  /** Le SVG avec son <title> et son <desc>, comme dans le Markdown de la leçon. */
  svg: string;
  legende?: string;
}

export function illustrationsDuPaquet(paquet: PaquetAvecIllustrations): IllustrationDuPaquet[] {
  return paquet.lecons.flatMap((lecon) =>
    lecon.blocs.flatMap((bloc, index) =>
      bloc.type === "illustration" && bloc.svg
        ? [
            {
              emplacement: `${lecon.slug} › bloc ${String(index + 1)}`,
              nom: `${lecon.slug}-bloc-${String(index + 1)}`,
              svg: svgComplet(bloc.svg, bloc.alt ?? "", bloc.description ?? ""),
              legende: bloc.legende ?? undefined,
            },
          ]
        : [],
    ),
  );
}
