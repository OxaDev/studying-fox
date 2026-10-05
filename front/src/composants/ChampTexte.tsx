import {
  FieldError,
  Input,
  Label,
  Text,
  TextArea,
  TextField,
  type TextFieldProps,
} from "react-aria-components";

import styles from "./Formulaire.module.css";

interface Props extends Omit<TextFieldProps, "className" | "children"> {
  label: string;
  /** Aide affichée sous le champ et lue par les lecteurs d'écran. */
  aide?: string;
  /** Zone de texte sur plusieurs lignes (commentaire…). */
  multiligne?: boolean;
}

export function ChampTexte({ label, aide, multiligne = false, ...props }: Props) {
  return (
    <TextField {...props} className={styles.champ}>
      <Label className={styles.label}>{label}</Label>
      {multiligne ? (
        <TextArea className={styles.saisie} rows={4} />
      ) : (
        <Input className={styles.saisie} />
      )}
      {aide && (
        <Text slot="description" className={styles.aide}>
          {aide}
        </Text>
      )}
      <FieldError className={styles.erreur} />
    </TextField>
  );
}
