# Installer et faire tourner le Renard Étudiant sur un serveur (ADR 0012 et 0031).
#
# Première installation :  make configurer  →  vérifier infra/.env  →  make deployer  →  make nginx
# Liste des commandes :     make
#
# Prérequis : Docker et Docker Compose 2.24 ou plus. Le développement, lui, se passe de Make
# (voir README.md).

SHELL := /bin/bash
.DEFAULT_GOAL := aide

ENV := infra/.env
# Compose lit infra/.env, y compris COMPOSE_FILE (avec ou sans nginx devant Caddy).
COMPOSE := cd infra && docker compose
SAUVEGARDES := $(CURDIR)/sauvegardes
DATE := $(shell date +%Y-%m-%d-%H%M%S)

# Valeur d'une variable de infra/.env.
lire = $(shell sed -n 's/^$(1)=//p' $(ENV) 2>/dev/null | tail -n 1)

.PHONY: aide configurer deployer mettre-a-jour demarrer arreter redemarrer etat journaux \
	sante admin sauvegarder restaurer nginx verifier-config

aide: ## Affiche cette aide
	@echo "Le Renard Étudiant : commandes du serveur"
	@echo
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | sed 's/:.*## /\t/' | \
		awk -F'\t' '{ printf "  make %-16s %s\n", $$1, $$2 }'

configurer: ## Crée infra/.env avec un mot de passe aléatoire pour la base
	@if [ -f $(ENV) ]; then echo "$(ENV) existe déjà : modifie-le à la main."; exit 1; fi
	@mot_de_passe=$$(openssl rand -hex 24) && \
		sed "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$$mot_de_passe/" infra/.env.example > $(ENV)
	@chmod 600 $(ENV)
	@echo "$(ENV) créé. Vérifie DOMAINE, CHEMIN_BASE et PORT_HTTP, puis lance : make deployer"

verifier-config:
	@if [ ! -f $(ENV) ]; then echo "$(ENV) manque : lance d'abord make configurer."; exit 1; fi
	@if [ "$(call lire,POSTGRES_PASSWORD)" = "a-generer" ] || [ -z "$(call lire,POSTGRES_PASSWORD)" ]; then \
		echo "POSTGRES_PASSWORD n'est pas défini dans $(ENV)."; exit 1; fi
	@chemin="$(call lire,CHEMIN_BASE)"; \
		if [ -n "$$chemin" ] && ! [[ "$$chemin" =~ ^(/[A-Za-z0-9_.-]+)+$$ ]]; then \
		echo "CHEMIN_BASE doit commencer par « / », sans barre finale : « $$chemin »"; exit 1; fi
	@version=$$(docker compose version --short 2>/dev/null) || \
		{ echo "Docker Compose est introuvable."; exit 1; }; \
		if [ "$$(printf '%s\n' 2.24.0 "$$version" | sort -V | head -n 1)" != 2.24.0 ]; then \
		echo "Docker Compose $$version est trop ancien : il faut la version 2.24 ou plus."; exit 1; fi

deployer: verifier-config ## Construit les images et (re)démarre tout le site
	$(COMPOSE) build --pull
	$(COMPOSE) up -d --wait --remove-orphans
	@echo
	@echo "En ligne : https://$(call lire,DOMAINE)$(call lire,CHEMIN_BASE)/"

mettre-a-jour: ## Récupère la dernière version du dépôt, puis redéploie
	git pull --ff-only
	$(MAKE) deployer

demarrer: verifier-config ## Démarre le site sans reconstruire les images
	$(COMPOSE) up -d --wait

arreter: ## Arrête le site (les données sont gardées)
	$(COMPOSE) down

redemarrer: ## Redémarre les services
	$(COMPOSE) restart

etat: ## État des services
	$(COMPOSE) ps

journaux: ## Suit les journaux (un seul service : make journaux SERVICE=api)
	$(COMPOSE) logs -f --tail=100 $(SERVICE)

sante: ## Vérifie que l'API et la base répondent, en passant par Caddy
	@curl -fsS http://127.0.0.1:$(or $(call lire,PORT_HTTP),8080)/api/sante/base && echo

admin: ## Nomme un admin, dont le compte existe déjà : make admin EMAIL=…
	@if [ -z "$(EMAIL)" ]; then echo "Usage : make admin EMAIL=prenom@exemple.fr"; exit 1; fi
	$(COMPOSE) exec api python -m app.comptes.commandes promouvoir-admin "$(EMAIL)"

sauvegarder: ## Copie la base et les images des leçons dans sauvegardes/
	@mkdir -p $(SAUVEGARDES)
	$(COMPOSE) exec -T db pg_dump -U renard --clean --if-exists renard \
		| gzip > $(SAUVEGARDES)/base-$(DATE).sql.gz
	$(COMPOSE) exec -T api tar -C /srv/medias -czf - . > $(SAUVEGARDES)/medias-$(DATE).tar.gz
	@echo "Sauvegardes : $(SAUVEGARDES)/base-$(DATE).sql.gz et medias-$(DATE).tar.gz"

restaurer: verifier-config ## Remplace les données : make restaurer BASE=….sql.gz [MEDIAS=….tar.gz]
	@if [ ! -f "$(BASE)" ]; then echo "Usage : make restaurer BASE=sauvegardes/base-….sql.gz [MEDIAS=…]"; exit 1; fi
	@read -r -p "Les données actuelles seront remplacées. Taper « oui » pour continuer : " reponse; \
		[ "$$reponse" = oui ] || { echo "Annulé."; exit 1; }
	$(COMPOSE) stop caddy api
	$(COMPOSE) up -d --wait db
	cd infra && gunzip -c "$(abspath $(BASE))" \
		| docker compose exec -T db psql -q -o /dev/null -U renard -d renard -v ON_ERROR_STOP=1
	@if [ -n "$(MEDIAS)" ]; then \
		$(COMPOSE) run --rm --no-deps -T api tar -C /srv/medias -xzf - < "$(abspath $(MEDIAS))"; fi
	$(COMPOSE) up -d --wait

nginx: ## Affiche la configuration à ajouter au nginx de la machine
	@chemin="$(call lire,CHEMIN_BASE)"; \
		if [ -z "$$chemin" ]; then echo "CHEMIN_BASE est vide dans $(ENV)."; exit 1; fi; \
		sed -e "s|__CHEMIN_BASE__|$$chemin|g" -e "s|__PORT_HTTP__|$(or $(call lire,PORT_HTTP),8080)|g" \
		infra/nginx/renard.conf
