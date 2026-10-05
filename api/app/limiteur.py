"""Limitation du nombre de tentatives (ADR 0008).

Les compteurs sont en mémoire : l'API tourne en un seul processus sur un seul serveur
(ADR 0012). Ils repartent à zéro au redémarrage, ce qui est acceptable.
"""

import time
from collections import defaultdict, deque


class Limiteur:
    def __init__(self, maximum: int, fenetre_secondes: float) -> None:
        self.maximum = maximum
        self.fenetre = fenetre_secondes
        self._essais: defaultdict[str, deque[float]] = defaultdict(deque)

    def _purger(self, cle: str) -> deque[float]:
        essais = self._essais[cle]
        limite = time.monotonic() - self.fenetre
        while essais and essais[0] < limite:
            essais.popleft()
        return essais

    def est_bloque(self, cle: str) -> bool:
        return len(self._purger(cle)) >= self.maximum

    def noter(self, cle: str) -> None:
        self._purger(cle).append(time.monotonic())

    def effacer(self, cle: str) -> None:
        self._essais.pop(cle, None)

    def vider(self) -> None:
        self._essais.clear()


# Connexion : échecs par email et par adresse IP, sur 15 minutes.
echecs_connexion = Limiteur(maximum=5, fenetre_secondes=15 * 60)
echecs_connexion_ip = Limiteur(maximum=30, fenetre_secondes=15 * 60)

# Emails envoyés (inscription, mot de passe oublié…) : par destinataire et par IP, sur 1 heure.
envois_email = Limiteur(maximum=3, fenetre_secondes=60 * 60)
envois_email_ip = Limiteur(maximum=20, fenetre_secondes=60 * 60)

TOUS = [echecs_connexion, echecs_connexion_ip, envois_email, envois_email_ip]
