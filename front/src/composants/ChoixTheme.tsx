import { useState } from "react";
import { Label, RadioButton, RadioField, RadioGroup, Text } from "react-aria-components";

import styles from "./ChoixTheme.module.css";
import formulaire from "./Formulaire.module.css";
import { choisirTheme, estTheme, lireTheme, type Theme, THEMES } from "./theme";

/** Choix du thème : appliqué tout de suite, sans bouton d'enregistrement. */
export function ChoixTheme() {
  const [theme, setTheme] = useState(lireTheme);

  return (
    <RadioGroup
      className={styles.choix}
      value={theme}
      onChange={(valeur) => {
        if (!estTheme(valeur)) return;
        choisirTheme(valeur);
        setTheme(valeur);
      }}
    >
      <Label className={formulaire.label}>Thème</Label>
      {(Object.keys(THEMES) as Theme[]).map((cle) => (
        <RadioField key={cle} value={cle}>
          <RadioButton className={styles.option}>{THEMES[cle]}</RadioButton>
        </RadioField>
      ))}
      <Text slot="description" className={formulaire.aide}>
        Ce choix est retenu par ce navigateur seulement.
      </Text>
    </RadioGroup>
  );
}
