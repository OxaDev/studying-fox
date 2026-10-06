import { afterEach, describe, expect, it, vi } from "vitest";

import { executerJavascript, formater } from "./executerJavascript";
import { Executeur, TAILLE_MAX, type WorkerExecution } from "./executeur";
import { nettoyerTraceback } from "./traceback";
import type { Demande, Flux, Message } from "./types";

async function executer(code: string) {
  const sorties: [Flux, string][] = [];
  const erreur = await executerJavascript(code, (flux, texte) => sorties.push([flux, texte]));
  return { sorties, erreur };
}

describe("Exécution JavaScript", () => {
  it("capture console.log", async () => {
    const { sorties, erreur } = await executer('console.log("Bonjour", 42)');

    expect(sorties).toEqual([["stdout", "Bonjour 42\n"]]);
    expect(erreur).toBeNull();
  });

  it("envoie console.error sur la sortie d'erreur", async () => {
    const { sorties } = await executer('console.error("Oups")');

    expect(sorties).toEqual([["stderr", "Oups\n"]]);
  });

  it("renvoie le message d'une erreur", async () => {
    const { erreur } = await executer("inconnue + 1");

    expect(erreur).toBe("ReferenceError: inconnue is not defined");
  });

  it("accepte await", async () => {
    const { sorties } = await executer("const x = await Promise.resolve(3); console.log(x)");

    expect(sorties).toEqual([["stdout", "3\n"]]);
  });

  it("affiche les objets en JSON", () => {
    expect(formater({ nom: "aiko", age: 3 })).toBe('{"nom":"aiko","age":3}');
    expect(formater([1, 2])).toBe("[1,2]");
    expect(formater(undefined)).toBe("undefined");
  });
});

describe("Trace d'erreur Python", () => {
  it("ne garde que les lignes qui concernent le code de la leçon", () => {
    const trace = [
      "Traceback (most recent call last):",
      '  File "/lib/python314.zip/_pyodide/_base.py", line 597, in eval_code',
      "    exec(compile(...))",
      '  File "<lecon>", line 2, in <module>',
      "NameError: name 'prenon' is not defined",
    ].join("\n");

    expect(nettoyerTraceback(trace)).toBe(
      [
        "Traceback (most recent call last):",
        '  File "<lecon>", line 2, in <module>',
        "NameError: name 'prenon' is not defined",
      ].join("\n"),
    );
  });

  it("garde la dernière ligne pour une erreur de syntaxe", () => {
    expect(nettoyerTraceback("bla\nbla\nSyntaxError: invalid syntax\n")).toBe(
      "SyntaxError: invalid syntax",
    );
  });
});

/** Faux worker : répond par les messages prévus, sans rien exécuter. */
class FauxWorker implements WorkerExecution {
  onmessage: ((evenement: MessageEvent<Message>) => void) | null = null;
  onerror: ((evenement: ErrorEvent) => void) | null = null;
  termine = false;
  readonly recus: Demande[] = [];
  private readonly reponses: (demande: Demande) => Message[];

  constructor(reponses: (demande: Demande) => Message[]) {
    this.reponses = reponses;
  }

  postMessage(demande: Demande): void {
    this.recus.push(demande);
    for (const message of this.reponses(demande)) {
      queueMicrotask(() => this.onmessage?.(new MessageEvent("message", { data: message })));
    }
  }

  terminate(): void {
    this.termine = true;
  }
}

describe("Exécuteur", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rassemble les sorties jusqu'à la fin", async () => {
    const worker = new FauxWorker(() => [
      { type: "debut" },
      { type: "sortie", flux: "stdout", texte: "1\n" },
      { type: "sortie", flux: "stdout", texte: "2\n" },
      { type: "fin", erreur: null },
    ]);
    const executeur = new Executeur(() => worker);

    const resultat = await executeur.executer("javascript", "...");

    expect(resultat).toEqual({
      statut: "ok",
      tronque: false,
      sorties: [
        { flux: "stdout", texte: "1\n" },
        { flux: "stdout", texte: "2\n" },
      ],
    });
  });

  it("transmet les feuilles du classeur après un code VBA", async () => {
    const feuilles = [{ nom: "Feuil1", lignes: [[null]], tronquee: false }];
    const executeur = new Executeur(
      () =>
        new FauxWorker(() => [
          { type: "debut" },
          { type: "feuilles", feuilles },
          { type: "fin", erreur: null },
        ]),
    );

    const resultat = await executeur.executer("vba", "...");

    expect(resultat.feuilles).toEqual(feuilles);
  });

  it("signale une erreur", async () => {
    const executeur = new Executeur(
      () => new FauxWorker(() => [{ type: "debut" }, { type: "fin", erreur: "Boum" }]),
    );

    const resultat = await executeur.executer("python", "...");

    expect(resultat.statut).toBe("erreur");
    expect(resultat.sorties).toEqual([{ flux: "stderr", texte: "Boum" }]);
  });

  it("arrête un code trop long et recrée le worker", async () => {
    vi.useFakeTimers();
    const workers: FauxWorker[] = [];
    const executeur = new Executeur(() => {
      const worker = new FauxWorker(() => [{ type: "debut" }]);
      workers.push(worker);
      return worker;
    }, 1000);

    const resultat = executeur.executer("javascript", "while (true) {}");
    await vi.advanceTimersByTimeAsync(1000);

    expect((await resultat).statut).toBe("delai");
    expect(workers[0]?.termine).toBe(true);
    void executeur.executer("javascript", "...");
    await vi.advanceTimersByTimeAsync(0);
    expect(workers).toHaveLength(2);
  });

  it("coupe une sortie trop longue", async () => {
    const executeur = new Executeur(
      () =>
        new FauxWorker(() => [
          { type: "debut" },
          { type: "sortie", flux: "stdout", texte: "x".repeat(TAILLE_MAX + 50) },
          { type: "fin", erreur: null },
        ]),
    );

    const resultat = await executeur.executer("javascript", "...");

    expect(resultat.tronque).toBe(true);
    expect(resultat.sorties[0]?.texte).toHaveLength(TAILLE_MAX);
  });

  it("prévient pendant le chargement de Python", async () => {
    const surChargement = vi.fn();
    const executeur = new Executeur(
      () =>
        new FauxWorker(() => [
          { type: "chargement" },
          { type: "debut" },
          { type: "fin", erreur: null },
        ]),
    );

    await executeur.executer("python", "...", { surChargement });

    expect(surChargement).toHaveBeenCalledOnce();
  });
});
