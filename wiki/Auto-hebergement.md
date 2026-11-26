# Auto-hébergement

Cadence tourne dans un seul conteneur Docker, avec une base SQLite par défaut : une machine personnelle suffit. Cette page est pour la personne qui installe et entretient le serveur : démarrage, variables, base de données, sauvegardes, mises à jour, mode hébergé et Kubernetes. Les valeurs sensibles sont notées `<jeton>` : ne les copiez jamais telles quelles.

## Démarrer avec Docker

Cadence garde les noms techniques de tududi (variables `CADENCE_*`, fichiers de base, préfixe `tt_` des clés API) pour que les installations existantes continuent de fonctionner. Seuls le nom affiché et l'image (`ghcr.io/preciselywrong/cadence`) ont changé.

```bash
docker run \
  -e CADENCE_USER_EMAIL=camille@example.com \
  -e CADENCE_USER_PASSWORD=<mot de passe> \
  -e CADENCE_SESSION_SECRET=<jeton> \
  -v ~/cadence/db:/app/db \
  -v ~/cadence/uploads:/app/uploads \
  -v ~/cadence/backups:/app/backups \
  -p 3002:3002 \
  -d ghcr.io/preciselywrong/cadence:latest
```

Ouvrez `http://localhost:3002` et connectez-vous. `CADENCE_SESSION_SECRET` se génère avec `openssl rand -hex 64`.

- `:latest` est construite depuis `main` ; chaque envoi reçoit aussi une étiquette `:sha-<court>` si vous voulez figer une version.
- Trois dossiers doivent survivre au conteneur : `/app/db` (la base), `/app/uploads` (les pièces jointes) et `/app/backups` (les exports faits depuis Profil › Sauvegarde & restauration).
- Si vos utilisateurs ouvrent Cadence à une autre adresse que `localhost` (par exemple `https://cadence.example.com`), ajoutez `BASE_URL` : les liens des e-mails (vérification du compte, mot de passe oublié) en dépendent.

### Avec docker-compose

Le dépôt fournit un `docker-compose.yml` qui lit sa configuration dans un fichier `.env` :

```bash
cp .env.example .env
# éditez .env, puis :
docker-compose up -d
```

Le fichier `.env.example` liste toutes les options, commentées, avec le lien vers la documentation de chacune.

## Variables principales

Seuls les noms sont donnés ; les valeurs par défaut et le détail sont dans `.env.example`.

| Sujet | Variables |
|---|---|
| Compte administrateur (créé au premier démarrage s'il n'y a aucun utilisateur) | `CADENCE_USER_EMAIL`, `CADENCE_USER_PASSWORD` |
| Session | `CADENCE_SESSION_SECRET` (obligatoire ; sert aussi à chiffrer les adresses d'agenda, d'Apprise et de webhooks, à poser avant de les enregistrer) |
| Adresse publique | `BASE_URL`, `CADENCE_ALLOWED_ORIGINS` |
| Derrière un proxy inverse | `CADENCE_TRUST_PROXY`, `COOKIE_SECURE` |
| Fichiers | `CADENCE_UPLOAD_PATH`, `FILE_UPLOAD_LIMIT_MB`, `PUID`, `PGID` (le propriétaire des dossiers montés) |
| Base de données | `DATABASE_URL`, `DB_SSL`, `DB_POOL_MAX` |
| E-mail | `ENABLE_EMAIL`, `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_FROM_ADDRESS` et les identifiants SMTP |
| Tâches de fond | `DISABLE_SCHEDULER`, `TELEGRAM_ENABLED`, `DISABLE_TELEGRAM` |
| Push du navigateur | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (générées à la première utilisation ; à fixer seulement pour partager une paire entre plusieurs instances) |
| Connexion SSO | `OIDC_ENABLED`, `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` |
| Agendas | `CALDAV_ENABLED`, `CALDAV_ALLOW_PRIVATE_HOSTS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| IA (fournisseur compatible OpenAI) | `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` |

### Derrière un proxy inverse

Avec Caddy, Nginx, Traefik ou un ingress, réglez `CADENCE_TRUST_PROXY` pour que Cadence lise la vraie adresse du client : `true` (un seul proxy, le plus simple), `1` (premier saut seulement), `loopback` ou un sous-réseau. Mettez l'adresse publique dans `CADENCE_ALLOWED_ORIGINS`. Sans ce réglage, la limitation de débit écrit une erreur de validation dans les journaux.

### Réseau privé

Apprise, les webhooks, CalDAV et les flux d'agenda refusent les adresses du réseau local (les adresses de lien local et de métadonnées cloud sont toujours refusées). Pour un serveur Apprise ou un n8n sur votre réseau, ajoutez `CALDAV_ALLOW_PRIVATE_HOSTS=true`. Voir [Notifications et rappels](Notifications-et-rappels).

## SQLite ou PostgreSQL

| | SQLite (par défaut) | PostgreSQL |
|---|---|---|
| Pour qui | Une instance personnelle ou familiale | Un usage multi-utilisateur ou plus gros |
| Choix | Rien à faire | Définir `DATABASE_URL` (par exemple `postgres://<utilisateur>:<mot de passe>@db:5432/cadence`) |
| Stockage | Un fichier dans `/app/db` | Un serveur PostgreSQL 14 ou plus récent ; seul `/app/uploads` (et `/app/backups`) doit persister |
| Premier démarrage | Schéma créé et migré | Base vide acceptée : le schéma est créé depuis les modèles |

Un exemple complet avec un service PostgreSQL intégré est fourni (`docs/examples/docker-compose.postgres.yml`, à copier comme `docker-compose.yml` à côté de votre `.env`). Pour une base externe (PostgreSQL géré, autre machine), retirez le service `db` et mettez `DATABASE_URL` dans `.env`. Un mot de passe contenant des caractères spéciaux se code dans l'adresse (`@` devient `%40`) ou se passe par `DB_PASSWORD`.

### Passer de SQLite à PostgreSQL : par export puis import

**Ne basculez jamais en pointant `DATABASE_URL` sur PostgreSQL au-dessus d'une installation SQLite remplie.** Par sécurité le conteneur refuse de démarrer quand PostgreSQL est choisi alors qu'une base SQLite contenant des données est présente ; `CADENCE_ALLOW_DIALECT_SWITCH=true` ne fait que forcer un PostgreSQL vide, il ne transfère rien. Il n'existe pas de transfert direct.

1. Sur l'ancienne instance, faites une **sauvegarde** : Profil › Sauvegarde & restauration › **Créer une sauvegarde maintenant**, puis **Télécharger**. Pour un administrateur, elle inclut tous les comptes de l'instance, avec les empreintes de leurs mots de passe : gardez le fichier aussi précieusement que la base.
2. Démarrez la nouvelle instance sur une base PostgreSQL **vide**, avec ses propres dossiers, et connectez-vous avec le compte créé par `CADENCE_USER_EMAIL`.
3. Profil › Sauvegarde & restauration › **Importer depuis un fichier**, choisissez le fichier, puis **Restaurer la sauvegarde**. L'import fusionne : un élément dont l'identifiant existe déjà est ignoré.
4. Vérifiez vos données, puis arrêtez l'ancienne instance. Gardez son dossier `db` quelques jours.

Ce que la sauvegarde ne contient pas : les clés API, les partages et permissions, les sessions. Recréez les clés (Profil › Clés API) et reconnectez les clients (Android, client Linux).

## Sauvegardes

| Situation | Ce qui est fait |
|---|---|
| SQLite, à chaque démarrage | Copie cohérente du fichier à côté de la base (`db-backup-<horodatage>.sqlite3`), puis migrations |
| Conservation | Jusqu'à 4 copies pour aujourd'hui, une par jour sur les 7 derniers jours, le reste est supprimé |
| Une migration qui reconstruit une table | Son propre instantané (`db-premigrate-<nom>.sqlite3`), jamais supprimé automatiquement |
| PostgreSQL | Pas de copie de fichier : utilisez `pg_dump`, par exemple depuis une tâche planifiée (le script `scripts/pg-backup.sh` fait un dump compressé et garde 14 jours) |
| Export par compte | Profil › Sauvegarde & restauration, écrit un fichier `.json.gz` dans `/app/backups` |

Pour restaurer une copie SQLite : arrêtez le conteneur, supprimez les fichiers `-wal` et `-shm` de la base, copiez la sauvegarde choisie à la place du fichier de base, redémarrez. Pour PostgreSQL : `gunzip -c <fichier> | psql "$DATABASE_URL"` dans une base vide.

Les copies de démarrage vivent sur le même disque que la base : elles protègent d'une migration ratée, pas d'une panne de disque. Copiez régulièrement `db`, `uploads` et `backups` ailleurs (autre machine, stockage distant). Ne copiez pas un fichier SQLite pendant que Cadence tourne sans passer par le script de sauvegarde : une copie simple oublie les écritures récentes.

## Mises à jour

1. Faites une sauvegarde (voir ci-dessus).
2. Tirez la nouvelle image et recréez le conteneur : `docker-compose pull && docker-compose up -d`.
3. Au démarrage, Cadence copie la base SQLite puis applique les migrations en attente avant d'accepter des requêtes. **Si une migration échoue, le conteneur refuse de démarrer** et le journal nomme la migration : la copie de démarrage est alors l'état d'avant la mise à jour ; restaurez-la et restez sur l'image précédente.

- **Version affichée.** Le numéro (par exemple « Cadence 2026.11.26 ») est en bas de la barre latérale. C'est une date (`AAAA.MM.JJ`, suivie de `.2`, `.3` pour un deuxième envoi le même jour), propre au serveur et au web.
- **Quoi de neuf.** Le journal des changements est `docs/fork/CHANGELOG.md`, une entrée par mise en production, la plus récente en haut ; l'application Android a le sien (`android/CHANGELOG.md`).
- **Ancien chemin de volume.** Depuis la version 1.2, la base se monte sur `/app/db` et les envois sur `/app/uploads` (et non plus sous `/app/backend/`). Si votre fichier compose date d'avant, corrigez les chemins : sinon les nouvelles données partent dans un volume anonyme perdu à la recréation du conteneur. Cadence affiche un avertissement au démarrage tant que l'ancien chemin est utilisé.
- **PostgreSQL oublié dans `.env`.** Une variable `DATABASE_URL` ou `DB_DIALECT` laissée par une autre application bascule Cadence sur PostgreSQL. Retirez-la pour garder SQLite.

## Projets TODO.md

Pour que des projets suivent des fichiers `TODO.md` (voir [Projets TODO.md](Projets-TODO-md)), montez un dossier **dédié** en lecture et écriture et nommez-le :

| Variable | Rôle |
|---|---|
| `CADENCE_TODO_ROOT` | Dossier racine dans le conteneur (par exemple `/app/todo-projects`) ; chaque sous-dossier qui contient un `TODO.md` peut être relié. Sans cette variable, la fonction est désactivée |
| `CADENCE_TODO_USER_EMAIL` | Compte propriétaire des projets (par défaut le premier administrateur) |
| `CADENCE_TODO_REPOS` | Dépôts git à suivre, séparés par des virgules (`cadence,notes`) ; chacun s'appuie sur `CADENCE_TODO_REPO_<NOM>_URL`, `_BRANCH`, `_PATH` et un accès (`_TOKEN` ou `_SSH_KEY`, à noter `<jeton>`) |

**Ne montez jamais votre dossier de travail ni un dossier qui contient des secrets** (fichiers `.env`, clés) : le conteneur pourrait tout lire. Le script `scripts/todo-md-sync.sh` copie seulement les `TODO.md` vers le dossier partagé, dans les deux sens, sans rien pousser sur git ; il tourne sur la machine qui porte vos projets, pas dans le conteneur, et Cadence remarque un fichier modifié sous 30 secondes.

## Connecteur claude.ai (MCP distant)

Cadence peut être ajouté comme connecteur personnalisé de claude.ai à une adresse publique comme `https://cadence.example.com/mcp`, pendant que l'application et l'API restent sur votre réseau privé.

- Variables : `CADENCE_PUBLIC_MCP_URL` (l'adresse publique ; elle active le serveur d'autorisation intégré), `CADENCE_MCP_OAUTH_ALLOWED_EMAILS` (comptes autorisés à consentir ; sinon les administrateurs seuls), `CADENCE_MCP_OAUTH_TOKEN_DAYS` (durée du jeton, 30 jours par défaut) et `CADENCE_MCP_OAUTH_REDIRECT_URIS`.
- Seuls les chemins du connecteur sont publics ; le compte doit avoir la double authentification, et un appairage de 10 minutes se lance depuis Profil › MCP › **Autoriser un nouveau connecteur**.
- Le jeton émis ne sert qu'au MCP : révoquez-le sous Profil › Clés API.

La marche à suivre complète (tunnel, règles de pare-feu, page de connexion protégée) est dans la documentation ; voir aussi [Intégrations, MCP et plugins](Integrations-MCP-et-plugins).

## Mode hébergé

Le mode hébergé (`CADENCE_HOSTED_MODE=true`) sert à faire tourner Cadence comme un service public où des inconnus s'inscrivent. **Une installation personnelle n'en a jamais besoin**, et tout y est inactif tant que la variable n'est pas posée.

| Ce qui change | Effet |
|---|---|
| Premier compte inscrit | Utilisateur ordinaire ; l'administrateur vient de `CADENCE_USER_EMAIL` |
| Démarrage | Refusé tant que le secret de session, le proxy, les origines, les adresses publiques, l'e-mail et PostgreSQL ne sont pas configurés |
| Forfaits | Gratuit, Pro et équipes, avec des limites (tâches, projets, notes, pièces jointes, IA) réglables par `CADENCE_PLANS_JSON` |
| Essai | `CADENCE_TRIAL_DAYS` (7 par défaut, `0` pour l'éteindre) à partir de la vérification de l'e-mail |
| Webhooks, IA, MCP, CalDAV | Réservés aux forfaits payants |

Pour une instance multi-utilisateur publique, un exemple compose séparé fait tourner l'interface et les tâches de fond (`DISABLE_SCHEDULER=true` et `DISABLE_TELEGRAM=true` sur les pods web) dans deux services.

## Kubernetes

Il n'y a pas de chart Helm : `docs/examples/kubernetes/` fournit des manifestes à copier (Deployment, Service, Ingress, deux volumes, Secret) avec la même image et les mêmes variables que Docker.

```bash
cp -r docs/examples/kubernetes cadence-k8s && cd cadence-k8s
cp secret.example.yaml secret.yaml   # administrateur et secret de session
# remplacez l'adresse d'exemple dans ingress.yaml et deployment.yaml
kubectl apply -k .
```

| Point | Ce qu'il faut savoir |
|---|---|
| Réplicas | **Un seul** avec SQLite : les tâches de fond tournent dans l'application, deux pods enverraient tout en double. Plusieurs pods web exigent PostgreSQL et la séparation web/tâches de fond |
| Stockage | La base sur un disque bloc (local-path, Longhorn, disque cloud), jamais sur NFS ou SMB (risque de corruption) ; avec PostgreSQL, aucun volume de base |
| Ingress | `CADENCE_TRUST_PROXY=1` pour un contrôleur simple ; limite de corps de requête relevée pour les pièces jointes |
| Droits des volumes | L'image démarre en administrateur, corrige les droits puis passe à l'utilisateur 1001 ; sur un export NFS avec `root_squash`, démarrez directement en 1001 |
| Sauvegardes | Instantané du volume, ou API d'export depuis une tâche planifiée avec une clé API ; ne copiez pas le fichier SQLite pendant que le pod tourne |
| Mises à jour | Fixez une étiquette d'image et lisez le journal des changements avant de la changer |

## Pour aller plus loin

- [README (démarrage, proxy, SSO, CalDAV, mise à jour)](https://github.com/PreciselyWrong/cadence/blob/main/README.md)
- [PostgreSQL](https://github.com/PreciselyWrong/cadence/blob/main/docs/16-postgresql.md)
- [Mode hébergé](https://github.com/PreciselyWrong/cadence/blob/main/docs/17-hosted-mode.md)
- [Kubernetes](https://github.com/PreciselyWrong/cadence/blob/main/docs/22-kubernetes.md)
- [Sauvegardes et restauration](https://github.com/PreciselyWrong/cadence/blob/main/docs/backups.md)
- [Projets TODO.md côté serveur](https://github.com/PreciselyWrong/cadence/blob/main/docs/35-todo-md-projects.md)
- [Connecteur claude.ai](https://github.com/PreciselyWrong/cadence/blob/main/docs/38-remote-mcp.md)
- [Journal des changements](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/CHANGELOG.md)
- Pages liées : [Intégrations, MCP et plugins](Integrations-MCP-et-plugins), [Notifications et rappels](Notifications-et-rappels), [Hors ligne et synchronisation](Hors-ligne-et-synchronisation), [Projets TODO.md](Projets-TODO-md)
