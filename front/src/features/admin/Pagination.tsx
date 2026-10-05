import { Link, useSearchParams } from "react-router";

import { PAR_PAGE } from "./api";
import styles from "./Admin.module.css";

/** Liens vers les pages précédente et suivante. Les autres critères de l'adresse sont gardés. */
export function Pagination({ page, total }: { page: number; total: number }) {
  const [parametres] = useSearchParams();
  const nbPages = Math.max(1, Math.ceil(total / PAR_PAGE));
  if (nbPages === 1) return null;

  const vers = (numero: number) => {
    const suivants = new URLSearchParams(parametres);
    if (numero === 1) suivants.delete("page");
    else suivants.set("page", String(numero));
    return `?${suivants.toString()}`;
  };

  return (
    <nav aria-label="Pagination" className={styles.pagination}>
      {page > 1 && <Link to={vers(page - 1)}>Page précédente</Link>}
      <span>
        Page {page} sur {nbPages}
      </span>
      {page < nbPages && <Link to={vers(page + 1)}>Page suivante</Link>}
    </nav>
  );
}
