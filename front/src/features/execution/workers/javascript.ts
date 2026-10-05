/**
 * Worker d'exécution JavaScript (ADR 0009).
 * Il est servi avec sa propre politique CSP, qui lui interdit toute requête réseau (csp.ts).
 */
import { executerJavascript } from "../executerJavascript";
import type { Demande, Message } from "../types";

function envoyer(message: Message): void {
  self.postMessage(message);
}

self.onmessage = async (evenement: MessageEvent<Demande>) => {
  envoyer({ type: "debut" });
  const erreur = await executerJavascript(evenement.data.code, (flux, texte) => {
    envoyer({ type: "sortie", flux, texte });
  });
  envoyer({ type: "fin", erreur });
};
