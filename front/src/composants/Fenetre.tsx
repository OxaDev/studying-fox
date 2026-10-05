import type { ReactNode } from "react";
import { Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from "react-aria-components";

import { Bouton } from "./Bouton";
import styles from "./Confirmation.module.css";

interface Props {
  /** Texte du bouton qui ouvre la fenêtre. */
  declencheur: string;
  /** Nom accessible du bouton, s'il doit être plus précis que son texte (dans un tableau). */
  labelDeclencheur?: string;
  titre: string;
  variante?: "primaire" | "secondaire";
  children: (fermer: () => void) => ReactNode;
}

/** Fenêtre de dialogue modale (formulaire court). Le focus reste piégé dedans. */
export function Fenetre({
  declencheur,
  labelDeclencheur,
  titre,
  variante = "secondaire",
  children,
}: Props) {
  return (
    <DialogTrigger>
      <Bouton variante={variante} aria-label={labelDeclencheur}>
        {declencheur}
      </Bouton>
      <ModalOverlay className={styles.fond} isDismissable>
        <Modal className={styles.fenetre}>
          <Dialog className={styles.dialogue}>
            {({ close }) => (
              <>
                <Heading slot="title" className={styles.titre}>
                  {titre}
                </Heading>
                {children(close)}
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
