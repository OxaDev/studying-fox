import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ToggleButton } from "react-aria-components";

import { Alerte } from "../../composants/Alerte";
import { CLES_AVANCEMENT, parcoursApi } from "../parcours/api";
import styles from "./BoutonTerminee.module.css";

interface Props {
  slug: string;
  terminee: boolean;
}

/**
 * Bouton bascule « Leçon terminée » (aria-pressed). Son nom ne change pas avec son état :
 * c'est l'état « enfoncé » qui est annoncé (bonne pratique ARIA).
 */
export function BoutonTerminee({ slug, terminee }: Props) {
  const queryClient = useQueryClient();
  const changement = useMutation({
    mutationFn: (terminer: boolean) =>
      terminer ? parcoursApi.terminer(slug) : parcoursApi.reprendre(slug),
    onSuccess: () =>
      Promise.all(CLES_AVANCEMENT.map((cle) => queryClient.invalidateQueries({ queryKey: cle }))),
  });

  return (
    <div className={styles.zone}>
      <ToggleButton
        className={styles.bouton}
        isSelected={terminee}
        isDisabled={changement.isPending}
        onChange={(terminer) => {
          changement.mutate(terminer);
        }}
      >
        <span className={styles.case} aria-hidden="true">
          {terminee ? "✓" : ""}
        </span>
        Leçon terminée
      </ToggleButton>
      {changement.error && <Alerte>{changement.error.message}</Alerte>}
    </div>
  );
}
