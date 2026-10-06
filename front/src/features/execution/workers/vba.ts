/**
 * Worker d'exécution VBA (ADR 0026). L'interpréteur est écrit en TypeScript : ce worker
 * n'a besoin ni d'eval, ni du réseau, et sa politique CSP lui interdit tout (csp.ts).
 */
import type { Demande, Message } from "../types";
import { executerVba } from "../vba/interpreteur";

function envoyer(message: Message): void {
  self.postMessage(message);
}

self.onmessage = (evenement: MessageEvent<Demande>) => {
  envoyer({ type: "debut" });
  const { erreur, feuilles } = executerVba(evenement.data.code, {
    ecrire: (texte) => {
      envoyer({ type: "sortie", flux: "stdout", texte });
    },
  });
  envoyer({ type: "feuilles", feuilles });
  envoyer({ type: "fin", erreur });
};
