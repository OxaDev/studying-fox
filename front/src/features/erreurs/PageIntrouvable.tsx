import { Link } from "react-router";

export function PageIntrouvable() {
  return (
    <>
      <title>Page introuvable — Le Renard Étudiant</title>
      <h1>Page introuvable</h1>
      <p>Le renard a cherché partout, mais cette page n&apos;existe pas.</p>
      <p>
        <Link to="/">Retourner à mon espace</Link>
      </p>
    </>
  );
}
