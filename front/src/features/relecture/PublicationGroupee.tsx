import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Alerte } from "../../composants/Alerte";
import { CaseACocher } from "../../composants/CaseACocher";
import { Confirmation } from "../../composants/Confirmation";
import { relectureApi } from "./api";

export interface ElementPubliable {
  revision_id: string;
  peut_publier: boolean;
}

export interface Selection {
  ids: string[];
  estChoisi: (id: string) => boolean;
  basculer: (id: string, coche: boolean) => void;
  toutBasculer: (coche: boolean) => void;
  tout: boolean;
  partiel: boolean;
  vide: boolean;
}

/** Les versions cochées. Celles qu'on ne peut pas publier ne sont jamais sélectionnées. */
export function useSelection(elements: ElementPubliable[], parDefaut: "tout" | "rien"): Selection {
  const publiables = elements.filter((e) => e.peut_publier).map((e) => e.revision_id);
  const [choisis, setChoisis] = useState<ReadonlySet<string>>(
    () => new Set(parDefaut === "tout" ? publiables : []),
  );
  const ids = publiables.filter((id) => choisis.has(id));
  return {
    ids,
    estChoisi: (id) => choisis.has(id),
    basculer: (id, coche) => {
      setChoisis((precedents) => {
        const suivants = new Set(precedents);
        if (coche) suivants.add(id);
        else suivants.delete(id);
        return suivants;
      });
    },
    toutBasculer: (coche) => {
      setChoisis(new Set(coche ? publiables : []));
    },
    tout: publiables.length > 0 && ids.length === publiables.length,
    partiel: ids.length > 0 && ids.length < publiables.length,
    vide: publiables.length === 0,
  };
}

export function CaseToutSelectionner({
  selection,
  avecTexte = true,
}: {
  selection: Selection;
  avecTexte?: boolean;
}) {
  return (
    <CaseACocher
      isSelected={selection.tout}
      isIndeterminate={selection.partiel}
      isDisabled={selection.vide}
      onChange={selection.toutBasculer}
      aria-label={avecTexte ? undefined : "Tout sélectionner"}
    >
      {avecTexte && "Tout sélectionner"}
    </CaseACocher>
  );
}

export function libelleLecons(nombre: number): string {
  return `${String(nombre)} leçon${nombre > 1 ? "s" : ""}`;
}

/**
 * Publie les versions cochées en une fois, après confirmation. L'API applique une décision
 * par version (historique, journal) et refuse tout si l'une d'elles ne peut pas l'être.
 */
export function PublierLaSelection({
  ids,
  onPubliees,
}: {
  ids: string[];
  onPubliees: (ids: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const publication = useMutation({
    mutationFn: (revisionIds: string[]) =>
      relectureApi.deciderEnGroupe({ decision: "publier", revision_ids: revisionIds }),
    onSuccess: async (resultat) => {
      onPubliees(resultat.revision_ids);
      await Promise.all(
        [["relecture"], ["lecons"], ["parcours"], ["progression"]].map((cle) =>
          queryClient.invalidateQueries({ queryKey: cle }),
        ),
      );
    },
  });
  const libelle = `Publier ${libelleLecons(ids.length)}`;

  return (
    <>
      <Confirmation
        declencheur={ids.length === 0 ? "Publier la sélection" : libelle}
        varianteDeclencheur="primaire"
        declencheurDesactive={ids.length === 0}
        declencheurEnCours={publication.isPending}
        titre={`${libelle} ?`}
        message="Elles seront visibles par tous les apprenants. Chaque publication est enregistrée à ton nom dans l'historique de la leçon."
        confirmer="Publier"
        onConfirmer={() => {
          publication.mutate(ids);
        }}
      />
      {publication.error && <Alerte>{publication.error.message}</Alerte>}
      {publication.isSuccess && (
        <Alerte type="succes">
          {libelleLecons(publication.data.revision_ids.length)} publiée
          {publication.data.revision_ids.length > 1 ? "s" : ""}.
        </Alerte>
      )}
    </>
  );
}
