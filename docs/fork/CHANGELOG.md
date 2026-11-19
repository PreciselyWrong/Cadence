# Changelog de Cadence

Une entrée par mise en production du serveur et du web, la plus récente en haut. Le numéro est la date (`AAAA.MM.JJ`, suivi de `.2`, `.3` pour un deuxième envoi le même jour) ; il vient de `cadenceVersion` dans `package.json` et s'affiche en bas de la barre latérale avec le commit de l'image (« Cadence 2026.11.19 · 95aa5a1 »). `version` de `package.json` reste celle de l'amont tududi (v1.14.0). Android garde ses propres numéros (`android/`, versionName).

Avant 2026.11.19 : pas de numéro propre ; l'historique est dans `git log` et `docs/fork/FORK.md`.

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
