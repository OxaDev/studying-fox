import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Form } from "react-aria-components";
import { useSearchParams } from "react-router";

import { Alerte } from "../../composants/Alerte";
import { Bouton } from "../../composants/Bouton";
import { CaseACocher } from "../../composants/CaseACocher";
import { ChampChoix } from "../../composants/ChampChoix";
import { ChampTexte } from "../../composants/ChampTexte";
import dialogue from "../../composants/Confirmation.module.css";
import { Fenetre } from "../../composants/Fenetre";
import formulaire from "../../composants/Formulaire.module.css";
import { useMoiConnecte } from "../comptes/session";
import tableau from "../relecture/Relecture.module.css";
import styles from "./Admin.module.css";
import { adminApi, lirePage, type Role, ROLES, type UtilisateurAdmin } from "./api";
import { NavAdmin } from "./NavAdmin";
import { Pagination } from "./Pagination";

const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

function etat(utilisateur: UtilisateurAdmin) {
  if (utilisateur.suspendu) return "Suspendu";
  if (!utilisateur.email_verifie) return "Email non confirmé";
  return "Actif";
}

/** Gestion des utilisateurs : recherche, rôles, suspension (cadrage § 5.8). */
export function PageUtilisateurs() {
  const moi = useMoiConnecte();
  const [parametres, setParametres] = useSearchParams();
  const q = parametres.get("q") ?? "";
  const page = lirePage(parametres.get("page"));
  const [saisie, setSaisie] = useState(q);
  const [message, setMessage] = useState("");
  const { data, error } = useQuery({
    queryKey: ["admin", "utilisateurs", q, page],
    queryFn: () => adminApi.utilisateurs(q, page),
  });

  return (
    <>
      <title>Utilisateurs — Administration — Le Renard Étudiant</title>
      <h1>Administration</h1>
      <NavAdmin />
      <h2>Utilisateurs</h2>

      <Form
        role="search"
        aria-label="Utilisateurs"
        className={styles.recherche}
        onSubmit={(evenement) => {
          evenement.preventDefault();
          setParametres(saisie.trim() ? { q: saisie.trim() } : {});
        }}
      >
        <ChampTexte
          label="Pseudo ou email"
          name="q"
          type="search"
          value={saisie}
          onChange={setSaisie}
          aide="Le début suffit."
        />
        <Bouton type="submit">Rechercher</Bouton>
      </Form>

      <p role="status">{message}</p>
      {error && <Alerte>{error.message}</Alerte>}
      {!data && !error && <p>Chargement…</p>}
      {data && data.total === 0 && <p>Aucun compte ne correspond.</p>}
      {data && data.total > 0 && (
        <>
          <div className={tableau.defilement}>
            <table className={tableau.tableau}>
              <caption>
                {data.total} compte{data.total > 1 ? "s" : ""}, du plus récent au plus ancien
              </caption>
              <thead>
                <tr>
                  <th scope="col">Pseudo</th>
                  <th scope="col">Email</th>
                  <th scope="col">Rôle</th>
                  <th scope="col">État</th>
                  <th scope="col">Inscrit le</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.utilisateurs.map((u) => (
                  <tr key={u.id}>
                    <th scope="row">{u.pseudo}</th>
                    <td>{u.email}</td>
                    <td>{ROLES[u.role]}</td>
                    <td>
                      <span className={u.suspendu ? styles.alerte : undefined}>{etat(u)}</span>
                    </td>
                    <td>{date.format(new Date(u.cree_le))}</td>
                    <td>
                      {u.id === moi.id ? (
                        "C'est toi"
                      ) : (
                        <ModifierUtilisateur utilisateur={u} surEnregistre={setMessage} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={data.total} />
        </>
      )}
    </>
  );
}

function ModifierUtilisateur({
  utilisateur,
  surEnregistre,
}: {
  utilisateur: UtilisateurAdmin;
  surEnregistre: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<Role>(utilisateur.role);
  const [suspendu, setSuspendu] = useState(utilisateur.suspendu);
  const modification = useMutation({
    mutationFn: () => adminApi.modifierUtilisateur(utilisateur.id, { role, suspendu }),
    onSuccess: () => {
      surEnregistre(`Modifications enregistrées pour ${utilisateur.pseudo}.`);
      return queryClient.invalidateQueries({ queryKey: ["admin", "utilisateurs"] });
    },
  });

  return (
    <Fenetre
      declencheur="Modifier"
      labelDeclencheur={`Modifier ${utilisateur.pseudo}`}
      titre={`Modifier ${utilisateur.pseudo}`}
    >
      {(fermer) => (
        <Form
          className={formulaire.formulaire}
          onSubmit={(evenement) => {
            evenement.preventDefault();
            modification.mutate(undefined, { onSuccess: fermer });
          }}
        >
          {modification.error && <Alerte>{modification.error.message}</Alerte>}
          <ChampChoix
            label="Rôle"
            name="role"
            valeur={role}
            onChange={(valeur) => {
              setRole(valeur as Role);
            }}
            options={Object.entries(ROLES).map(([valeur, libelle]) => ({ valeur, libelle }))}
          />
          <CaseACocher isSelected={suspendu} onChange={setSuspendu}>
            Compte suspendu : la personne est déconnectée et ne peut plus se connecter.
          </CaseACocher>
          <div className={dialogue.actions}>
            <Bouton variante="secondaire" onPress={fermer}>
              Annuler
            </Bouton>
            <Bouton type="submit" isPending={modification.isPending}>
              Enregistrer
            </Bouton>
          </div>
        </Form>
      )}
    </Fenetre>
  );
}
