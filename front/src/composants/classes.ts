/** Assemble des noms de classes CSS en ignorant les valeurs vides. */
export function classes(...noms: (string | false | null | undefined)[]): string {
  return noms.filter(Boolean).join(" ");
}
