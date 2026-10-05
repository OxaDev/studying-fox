import { useId } from "react";

import styles from "./Formulaire.module.css";

interface Props {
  label: string;
  name: string;
  valeur: string;
  options: { valeur: string; libelle: string }[];
  onChange: (valeur: string) => void;
  aide?: string;
}

/** Liste déroulante native : la plus simple et la plus accessible. */
export function ChampChoix({ label, name, valeur, options, onChange, aide }: Props) {
  const id = useId();
  return (
    <div className={styles.champ}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={valeur}
        className={styles.saisie}
        aria-describedby={aide ? `${id}-aide` : undefined}
        onChange={(evenement) => {
          onChange(evenement.target.value);
        }}
      >
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}
      </select>
      {aide && (
        <span id={`${id}-aide`} className={styles.aide}>
          {aide}
        </span>
      )}
    </div>
  );
}
