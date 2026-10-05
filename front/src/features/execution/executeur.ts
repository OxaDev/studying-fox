import type { Demande, Langage, Message, Resultat, Sortie } from "./types";

export const DELAI_MS = 10_000;
export const TAILLE_MAX = 10_000;

/** Ce dont l'exécuteur a besoin d'un worker. Les tests en fournissent un faux. */
export interface WorkerExecution {
  onmessage: ((evenement: MessageEvent<Message>) => void) | null;
  onerror: ((evenement: ErrorEvent) => void) | null;
  postMessage(demande: Demande): void;
  terminate(): void;
}

export type FabriqueWorker = (langage: Langage) => WorkerExecution;

const fabriqueParDefaut: FabriqueWorker = (langage) =>
  langage === "python"
    ? new Worker(new URL("./workers/python.ts", import.meta.url), { type: "module" })
    : new Worker(new URL("./workers/javascript.ts", import.meta.url), { type: "module" });

export interface Suivi {
  /** Python se charge (une seule fois par page, quelques secondes). */
  surChargement?: () => void;
  /** Le code commence à s'exécuter : le délai maximum démarre. */
  surDebut?: () => void;
}

/**
 * Exécute le code des leçons dans des workers, un par langage (ADR 0009).
 * Un code trop long est arrêté au bout de DELAI_MS, et son worker est recréé.
 */
export class Executeur {
  private readonly workers = new Map<Langage, WorkerExecution>();
  private file: Promise<unknown> = Promise.resolve();
  private readonly fabrique: FabriqueWorker;
  private readonly delaiMs: number;

  constructor(fabrique: FabriqueWorker = fabriqueParDefaut, delaiMs = DELAI_MS) {
    this.fabrique = fabrique;
    this.delaiMs = delaiMs;
  }

  /** Les exécutions passent l'une après l'autre. */
  executer(langage: Langage, code: string, suivi: Suivi = {}): Promise<Resultat> {
    const execution = this.file.then(() => this.lancer(langage, code, suivi));
    this.file = execution;
    return execution;
  }

  private worker(langage: Langage): WorkerExecution {
    let worker = this.workers.get(langage);
    if (!worker) {
      worker = this.fabrique(langage);
      this.workers.set(langage, worker);
    }
    return worker;
  }

  private arreter(langage: Langage): void {
    this.workers.get(langage)?.terminate();
    this.workers.delete(langage);
  }

  private lancer(langage: Langage, code: string, suivi: Suivi): Promise<Resultat> {
    const worker = this.worker(langage);
    const sorties: Sortie[] = [];
    let taille = 0;
    let tronque = false;
    let minuteur: ReturnType<typeof setTimeout> | undefined;

    return new Promise((resolve) => {
      const terminer = (statut: Resultat["statut"], erreur: string | null) => {
        clearTimeout(minuteur);
        if (erreur) sorties.push({ flux: "stderr", texte: erreur });
        resolve({ sorties, statut, tronque });
      };

      worker.onmessage = (evenement: MessageEvent<Message>) => {
        const message = evenement.data;
        switch (message.type) {
          case "chargement":
            suivi.surChargement?.();
            break;
          case "debut":
            suivi.surDebut?.();
            minuteur = setTimeout(() => {
              this.arreter(langage);
              terminer("delai", null);
            }, this.delaiMs);
            break;
          case "sortie": {
            const reste = TAILLE_MAX - taille;
            if (reste <= 0) {
              tronque = true;
              break;
            }
            const texte = message.texte.slice(0, reste);
            tronque ||= texte.length < message.texte.length;
            taille += texte.length;
            sorties.push({ flux: message.flux, texte });
            break;
          }
          case "fin":
            terminer(message.erreur ? "erreur" : "ok", message.erreur);
            break;
        }
      };
      worker.onerror = () => {
        this.arreter(langage);
        terminer("erreur", "L'exécution a échoué de façon inattendue.");
      };
      worker.postMessage({ code } satisfies Demande);
    });
  }
}

export const executeur = new Executeur();
