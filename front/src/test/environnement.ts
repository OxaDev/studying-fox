/**
 * Environnement des tests : jsdom, ajusté pour Node 26.
 *
 * - Node 26 a son propre `localStorage` global : on le retire, pour que jsdom installe le sien.
 * - Le `Request` de Node refuse un signal d'annulation qui ne vient pas de Node. React Router
 *   en crée un à chaque navigation : on garde donc l'AbortController de Node, et non celui de jsdom.
 */
import { builtinEnvironments, type Environment } from "vitest/environments";

const environnement: Environment = {
  name: "jsdom-node",
  transformMode: "web",
  async setup(global: typeof globalThis, options) {
    const { AbortController, AbortSignal } = global;
    Reflect.deleteProperty(global, "localStorage");
    Reflect.deleteProperty(global, "sessionStorage");
    const jsdom = await builtinEnvironments.jsdom.setup(global, options);
    Object.assign(global, { AbortController, AbortSignal });
    return jsdom;
  },
};

export default environnement;
