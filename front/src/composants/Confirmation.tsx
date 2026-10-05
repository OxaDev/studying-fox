import { Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from "react-aria-components";

import { Bouton } from "./Bouton";
import styles from "./Confirmation.module.css";

interface Props {
  declencheur: string;
  /** Nom accessible du bouton, s'il doit être plus précis que son texte (dans un tableau). */
  labelDeclencheur?: string;
  titre: string;
  message: string;
  confirmer: string;
  onConfirmer: () => void;
  varianteDeclencheur?: "primaire" | "secondaire";
  declencheurDesactive?: boolean;
  declencheurEnCours?: boolean;
}

/** Demande de confirmation avant une action irréversible. Le focus reste piégé dans la fenêtre. */
export function Confirmation({
  declencheur,
  labelDeclencheur,
  titre,
  message,
  confirmer,
  onConfirmer,
  varianteDeclencheur = "secondaire",
  declencheurDesactive = false,
  declencheurEnCours = false,
}: Props) {
  return (
    <DialogTrigger>
      <Bouton
        variante={varianteDeclencheur}
        aria-label={labelDeclencheur}
        isDisabled={declencheurDesactive}
        isPending={declencheurEnCours}
      >
        {declencheur}
      </Bouton>
      <ModalOverlay className={styles.fond} isDismissable>
        <Modal className={styles.fenetre}>
          <Dialog role="alertdialog" className={styles.dialogue}>
            {({ close }) => (
              <>
                <Heading slot="title" className={styles.titre}>
                  {titre}
                </Heading>
                <p>{message}</p>
                <div className={styles.actions}>
                  <Bouton variante="secondaire" onPress={close}>
                    Annuler
                  </Bouton>
                  <Bouton
                    onPress={() => {
                      close();
                      onConfirmer();
                    }}
                  >
                    {confirmer}
                  </Bouton>
                </div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
