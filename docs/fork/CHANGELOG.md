# Changelog de Cadence

Une entrée par mise en production du serveur et du web, la plus récente en haut. Le numéro est la date (`AAAA.MM.JJ`, suivi de `.2`, `.3` pour un deuxième envoi le même jour) ; il vient de `cadenceVersion` dans `package.json` et s'affiche en bas de la barre latérale (« Cadence 2026.11.19 ») ; le commit de l'image reste lisible dans `GET /api/version` (`build`). `version` de `package.json` reste celle de l'amont tududi (v1.14.0). Android garde ses propres numéros (`android/`, versionName).

Avant 2026.11.19 : pas de numéro propre ; l'historique est dans `git log` et `docs/fork/FORK.md`.

## 2026.11.26.10

- **À trier dans la langue du compte** : les cartes des règles (reports, doublons, conflits d'agenda, échéance lue dans une note) et la notification « N mails à trier » étaient toujours en français ; elles sont maintenant en anglais pour un compte qui n'est pas en français.
- **Wiki utilisateur** (en anglais) : une page par fonctionnalité, publiée sur le wiki GitHub à chaque mise en production.

## 2026.11.26.9

Corrections issues de l'audit UX du client web sur ordinateur (`docs/fork/UX-AUDIT-WEB.md`).

- Langue : le message de fin de tâche est traduit et identique partout, les dates suivent la langue de l'interface (tableau, panneau du projet, feuille de route, objectifs, chronologie, focus), « Ajouter » et « Filtrer » sont traduits, « Nom » et « Prénom » sont remis dans le bon ordre en français.
- Projets › Tableau : « Tâches par projet » montre aussi les sous-projets prévus ou non commencés ; les noms des vues intégrées sont traduits. Les tableaux enregistrés reprennent les vues intégrées et gardent les vues créées à la main.
- Fiche de tâche : une ligne survolée ne passe plus par-dessus la fiche, fermer la fiche rend le focus à la ligne d'origine, un titre long passe à la ligne.
- Barre latérale : le rail d'icônes garde le même ordre sur toutes les pages ; sous 1280 px de large la barre démarre repliée, et un choix explicite est mémorisé sur l'appareil.
- Aujourd'hui : pas de « Rien de prévu » pendant le chargement, une seule heure par ligne, un créneau passé se lit « Manquée à 09:30 ». Planifier : une seule puce par carte.
- Calendrier › Mois : un jour de plus de trois entrées en montre deux et un bouton « +N » qui liste les autres.
- Habitudes : une habitude à plusieurs séances affiche « 2 sur 3 cette semaine » et sa carte se remplit en proportion.
- Feuille de route : les libellés d'objectifs ne se chevauchent plus.

## 2026.11.26.8

- **Variables d'environnement renommées** : toutes les `TUDUDI_*` deviennent `CADENCE_*` (`CADENCE_SESSION_SECRET`, `CADENCE_USER_EMAIL`, `CADENCE_ALLOWED_ORIGINS`, etc.). Les anciens noms sont encore lus pour cette version, avec un avertissement au démarrage, puis retirés à la suivante : renomme-les dans ton conteneur ou ton `.env`. Bases, cookies et préfixe `tt_` des jetons ne changent pas.
- Docker : l'image ne fixe plus de valeurs par défaut pour ces variables ; les chemins `/app/uploads` et `/app/backups` restent les défauts du conteneur.
- Projets › Tableau : dans la vue « Projets », un clic sur une carte ouvre le tiroir de ses tâches (celles en cours d'abord), le compteur dit « N ouvertes », le glisser des cartes marche sous Firefox et la barre de défilement horizontale reste à l'écran.

## 2026.11.26.7

- Aujourd'hui : le bouton « Aujourd'hui » reste dans la barre du jour, grisé quand on y est déjà, et les flèches de jour ne bougent plus avec la longueur du titre.

## 2026.11.26.6

- Projets › Tableau : dans chaque section, les tâches suivent l'ordre du fichier TODO.md.
- Synchronisation : les appareils reçoivent la section de fichier de chaque tâche (`source_section`) et l'État actuel de chaque projet TODO.md (`handoff_state`), en lecture seule.
- Android 1.49.0 (`android/CHANGELOG.md`) : tableau des sous-projets sur un projet parent (colonnes par sous-projet, sections du fichier, prochaine action, « Actualiser les TODO.md »), fiche de tâche dans l'ordre du web, Aujourd'hui et saisie rapide revus, widget Aujourd'hui stabilisé.

## 2026.11.26.5

- Projets › Tableau : deux vues au lieu de quatre, « Tâches par projet » et « Projets » ; les tableaux déjà enregistrés passent aux deux vues et gardent les vues créées à la main. Le type de vue et le filtre des 7 derniers jours sont dans Affichage, les colonnes sans tâche sont masquées, la limite WIP du portefeuille disparaît.
- Projets › Tableau : dans une colonne, l'État actuel se réduit à la prochaine action (branche, arbre et âge dans l'infobulle et le tiroir), la pastille de santé n'apparaît que pour un projet bloqué ou périmé, les tâches ont le rond de coche de Cadence et tous les statuts sont traduits.
- Projets › Tableau : la bannière du projet se retire sur l'onglet Tableau, les colonnes font 250 px et changer de vue garde la position de défilement.
- Corrigé : boucle de rendu possible du tableau d'un projet sans sous-projet ; « Actualiser les TODO.md » n'est plus mis en file hors ligne.
- Projets `TODO.md` : la place de chaque puce du fichier est retenue (`tasks.source_position`, migration) ; pas encore d'effet visible, le tri du tableau suivra.
- Android (sans nouvelle version, toujours 1.48.0) : fiche de tâche dans l'ordre du web, « Découper » court sur la ligne d'ajout de sous-tâche, `version.json` relu à chaque build.

## 2026.11.26.4

- Projets › Tableau : un clic n'importe où sur une carte ouvre la tâche (seul le titre le faisait) ; la case à cocher et les menus gardent leur action, le glisser reste inchangé.

## 2026.11.26.3

- Projets › Tableau : texte et colonnes agrandis, chaque colonne défile sous son en-tête, bouton « Actualiser les TODO.md » qui relit les fichiers de tous les sous-projets.
- Projets › Tableau : pastille de santé par sous-projet (bloqué, périmé, à jour) avec un seuil réglable (14 jours), tâches regroupées par section du fichier (Now, Next, Ideas), sections repliées après 8 cartes.
- Projets `TODO.md` : la ligne compacte « Branche: x | Arbre: y » donne la branche et l'état de l'arbre séparément.
- Corrigé : « + View » fonctionne dans le client Linux (le nom se saisit dans la barre), le chevron des menus du tableau ne recouvre plus le texte.
- Fiche de tâche remise en ordre (web) : planification sous les chips, « Découper en étapes » sur la ligne d'ajout de sous-tâche, une seule barre « Joindre · Commenter · Historique » ; les traductions sont à jour dès un déploiement.

## 2026.11.26.2

- Projets `TODO.md` : `#bug` (étiquette), `!high` / `!med` / `!low` et `@AAAA-MM-JJ` dans une puce ajoutent les étiquettes et fixent la priorité et l'échéance ; ils disparaissent du titre et changer l'un d'eux garde la même tâche.
- « Découper en étapes » dans la fiche d'une tâche (web et Android) : l'IA propose de petites étapes minutées, à modifier avant de les ajouter en sous-tâches avec leur durée ; sans IA, « Première étape de 2 min ? ». Réglages dans Profil et Réglages Android.
- Android 1.47.0 (`android/CHANGELOG.md`) : un clic sur une tâche d'un widget l'ouvre aussi quand l'app est déjà ouverte.
- « Historique » en bas de la fiche d'une tâche (web et Android) : chaque changement avec son heure exacte et son origine (dans l'app, clé d'API, appareil, IA, suggestion IA acceptée) ; la création est notée partout.
- Android 1.48.0 (`android/CHANGELOG.md`) : « Historique » dans la fiche de tâche.

## 2026.11.26

- Projets › Tableau : tour de contrôle Kanban multi-sous-projets activée par défaut pour les projets parents (vues enregistrées `Actifs` 1 colonne/projet, `Portefeuille` par statut/priorité/étiquette avec compteur WIP visuel et tiroir latéral « Voir », `Tâches` agrégées, `En pause`), colonne « Captures » glissable à gauche, filtre 7 jours, colonnes repliables, liste « Sous-projets » du dessus repliable, mode mobile à onglets.
- Projets `TODO.md` : la section `## État actuel` (handoff) est extraite automatiquement dans l'état du projet (branche, bloqueurs, prochaine action) sans créer de fausses tâches, et affichée sur les cartes et la fiche projet.
- Android : une tâche capturée sans date avec `+projet` ou `~domaine` reste visible dans « À classer » (`needsWhen = true`), avec confirmation de destination.

## 2026.11.21

- Week-end : plusieurs sorties proposées pour la même demi-journée (16 au plus), chacune à choisir ou à ignorer.
- Week-end : chaque sortie peut afficher une vignette (`image`) et un lieu (`place`), et la feuille ajoute la section « Près de chez nous » (`nearby`) sur le web et Android.
- Google : la connexion (ou la reconnexion) peut se faire depuis le téléphone, dans Réglages › Agendas ; l'alerte de synchro en échec y mène.
- Add-on Firefox 2.1.1 : la tâche capturée peut recevoir l'échéance Aujourd'hui ou Demain.
- Synchronisation hors ligne : les commentaires de tâche, la personne assignée et les sections de projet passent par la synchro, pour le téléphone.
- Android 1.44.0 (`android/CHANGELOG.md`).

## 2026.11.20.4

- Client Linux et web : une écriture en attente qui met trop de temps à répondre ne fait plus passer toute l'app « hors ligne ». Les réglages (Planification, Classement…) se chargent de nouveau ; l'écriture est retentée puis mise de côté.

## 2026.11.20.3

- Profil › Calendriers montre de nouveau la connexion Google (Agenda et Tasks), pas seulement les agendas ICS. Quand la synchro échoue, un bouton « Reconnecter Google » apparaît.

## 2026.11.20.2

- Synchronisation Google en échec (accès expiré, Google injoignable) : une alerte dans la cloche, sur le téléphone et sur le client Linux, qui disparaît d'elle-même dès que la synchro remarche. Sur le web, elle ouvre Profil › Calendriers.

## 2026.11.20

- Trier mes mails : un résumé de 2 ou 3 lignes d'abord (qui écrit, de quoi il s'agit, quoi faire et pour quand), puis le mail entier en texte propre sous « Lire le mail », même s'il arrive en HTML.
- Une tâche dont on repousse l'échéance quitte la journée. Pour une tâche récurrente, la question « cette occurrence ou la série » propose « Retirer aussi de ma journée ».
- « Appliquer » sur « Ta semaine est prête » ne reste plus bloqué : les appels à l'IA et les propositions ne passent plus par la file hors ligne du navigateur.
- Android 1.43.0 : « Ma matinée » enchaîne mails, retards et journée (`android/CHANGELOG.md`).

## 2026.11.19.6

- Cloche des notifications : seulement ce qui attend encore. Une notification lue disparaît, et celles dont le travail est fait (mails triés, décisions prises, proposition validée ou remplacée) passent en lues d'elles-mêmes, sur le web comme sur le téléphone.
- Android 1.42.2 (`android/CHANGELOG.md`).

## 2026.11.19.5

- Une tâche ajoutée par « Capturer » pour un autre jour (« demain », une date) apparaît tout de suite sur le Plan et sur Aujourd'hui, sans recharger la page.

## 2026.11.19.4

- Aujourd'hui, feuille « Replanifier » : un jour pas encore chargé n'affiche plus « (0) », qui faisait croire qu'il était libre.
- Android 1.42.0 sur NicoApps (menu de tâche unique, liens « bloque », description de projet, Réglages › À trier ; `android/CHANGELOG.md`).

## 2026.11.19.3

### Retards et IA

- « Replanifier avec l'IA » dans la bande « En retard » du Plan : l'IA propose un jour, un horizon, « faite » ou « abandonner » pour chaque retard, à valider sur le tableau.
- Passage du matin : à 6 h 30 (réglable dans Profil › Planification), s'il y a des retards, l'IA prépare la proposition et une notification « N retards replacés, à valider » arrive ; une fois par jour au plus, jamais le soir.
- La semaine proposée par l'IA voit la Boîte de réception, les horizons et les projets, et peut proposer « faite » (plugin Hermes 3.11.0).

### Aujourd'hui (repris d'Android)

- Feuille « Replanifier » des retards : un clic par tâche (aujourd'hui, demain, un jour, un horizon, une date, fait, abandonner ; une série : fait ou passer), « Tout à demain », « Étaler sur 7 jours », annulation.
- La journée en ligne du temps : « À caser » puis « Ma journée » sur un axe (maintenant, passé atténué, prochaine chose, « en même temps », créneaux libres et « Caser les N ici »), « N à faire » sous la date.
- Repli « Demain » avant les suggestions.

### Menus et sélection (web)

- Un seul menu de tâche partout (clic droit, « ⋯ », touche Menu) : Ouvrir, Terminer, Date, Priorité, Projet, Épingler, Dupliquer, Transformer en projet, Copier le lien ou le titre, Supprimer avec annulation.
- Ctrl ou Maj + clic sur les lignes, barre d'actions groupées ; « Ajouter une tâche » lit date, priorité, projet et étiquettes ; J/K dans la fiche.

### Rituel du matin (Android 1.41.0)

- La notification du matin ouvre trois étapes de grandes cartes : chaque retard avec le conseil de l'IA en avant et le choix à soi, « Ta journée » avec les trois tâches qui comptent, puis « C'est parti » (`docs/50-morning-ritual.md`, plugin Hermes 3.12.0).

### Divers

- L'ancien chemin des réponses du résumé du jour est retiré (Android 1.21 et suivants).

## 2026.11.19.2

- Plan, calendrier fusionné : les événements sont des cartes comme les tâches, avec une icône de calendrier à la couleur de l'agenda à la place du rond (comme sur Android).
- La barre latérale affiche « Cadence 2026.11.19.2 », sans le commit (toujours dans `GET /api/version`).

## 2026.11.19

### Plan

- « En retard » en haut de la colonne de gauche, en une ligne repliable ; « Replanifier » répartit par urgence sur les jours les plus légers.
- Colonne de gauche en une seule liste dans l'ordre du temps : En retard, Repoussées, Boîte de réception, Cette semaine, Semaine prochaine, Ce mois-ci, Mois prochain, Un jour ; sections repliables et encadrées.
- Section « Repoussées » (3 reports ou plus en 30 jours) et badge « ↻ N× » sur les cartes.
- Bouton « → jour » : pose une tâche sur le premier jour qui a la place (Boîte de réception, Cette semaine, Semaine prochaine, Ce mois-ci).
- Calendrier fusionné : les événements dans les colonnes de jour, entre les tâches selon l'heure ; un clic ouvre leur détail.
- « Planifier ma semaine » (IA) montrée sur le tableau, plus de modale ; bouton seulement quand un agent écoute.
- Sélection multiple, raccourcis clavier, charge de la semaine, colonne de la Boîte redimensionnable.
- Ces outils restent sur le web : l'écran du téléphone est trop petit (`docs/fork/DECISIONS.md`).

### Tâches

- La fiche de tâche se ferme quand on termine la tâche.
- Sur grand écran (1280 px et plus), la fiche s'ouvre en colonne sur le tiers opposé au clic.
- « Discuter avec l'IA » dans l'en-tête de la fiche (plugin Hermes 3.10.0).
- Une adresse tapée comme nom de tâche est un lien : titre de la page, icône, image ; le site s'ouvre d'un clic sur la carte et depuis la fiche.

### Aujourd'hui

- Les tâches en retard sont des lignes de tâche : case à cocher, glisser vers la liste ou le calendrier.

### Agenda

- Un clic sur un événement montre sa fiche en lecture, aux couleurs de l'app ; « Modifier » ouvre l'éditeur d'un agenda Google en écriture ; « Ouvrir dans Google Agenda ».

### Hors ligne et client Linux

- Une page demande toujours le serveur ; hors ligne, seule la coquille de la version en cours ; les anciennes versions sont purgées (le client Linux affichait une version de deux semaines).
- Le numéro de version de Cadence et le commit de l'image en bas de la barre latérale ; ce changelog.
