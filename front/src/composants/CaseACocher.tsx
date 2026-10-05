import type { ReactNode } from "react";
import { CheckboxButton, CheckboxField } from "react-aria-components";

import styles from "./CaseACocher.module.css";

interface Props {
  isSelected: boolean;
  onChange: (coche: boolean) => void;
  /** Coché en partie : pour une case « tout sélectionner ». */
  isIndeterminate?: boolean;
  isDisabled?: boolean;
  /** Texte visible. Sans texte, `aria-label` est obligatoire (dans un tableau, par exemple). */
  children?: ReactNode;
  "aria-label"?: string;
}

/** Case à cocher de React Aria, à l'allure de la charte. */
export function CaseACocher({ children, ...props }: Props) {
  return (
    <CheckboxField {...props}>
      <CheckboxButton className={styles.case}>
        {({ isSelected, isIndeterminate }) => (
          <>
            <span className={styles.boite} aria-hidden="true">
              {isIndeterminate ? "–" : isSelected ? "✓" : ""}
            </span>
            {children && <span>{children}</span>}
          </>
        )}
      </CheckboxButton>
    </CheckboxField>
  );
}
