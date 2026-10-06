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
  /** Action destructive : boutons en rouge (déclencheur et confirmation). */
  destructive?: boolean;
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
  destructive = false,
}: Props) {
  return (
    <DialogTrigger>
      <Bouton
        variante={destructive ? "danger" : varianteDeclencheur}
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
                    variante={destructive ? "danger" : "primaire"}
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
