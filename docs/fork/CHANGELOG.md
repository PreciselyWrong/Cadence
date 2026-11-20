# Changelog de Cadence

Une entrée par mise en production du serveur et du web, la plus récente en haut. Le numéro est la date (`AAAA.MM.JJ`, suivi de `.2`, `.3` pour un deuxième envoi le même jour) ; il vient de `cadenceVersion` dans `package.json` et s'affiche en bas de la barre latérale (« Cadence 2026.11.19 ») ; le commit de l'image reste lisible dans `GET /api/version` (`build`). `version` de `package.json` reste celle de l'amont tududi (v1.14.0). Android garde ses propres numéros (`android/`, versionName).

Avant 2026.11.19 : pas de numéro propre ; l'historique est dans `git log` et `docs/fork/FORK.md`.

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
