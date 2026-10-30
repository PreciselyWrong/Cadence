# TODO

Décisions, références et pièges du fork : [docs/fork/DECISIONS.md](docs/fork/DECISIONS.md).

## Now

- Synchro Google (module `google-sync`, fusionné dans `main`) : créer le client OAuth (Calendar + Tasks API, app « En production »), définir `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` sur Unraid, connecter, puis 3 jours d'usage mixte. Vérif : aucun doublon, modifs visibles des deux côtés en < 2 min. Voir `docs/33-google-sync.md`.
- **Impératif : synchronisation complète app Android ↔ serveur.** Tout ce que l'app stocke doit être synchronisé et visible ou modifiable sur le web, habitudes d'abord : habitudes, saisies (date locale, fuseau, source, note), versions d'objectif et de planning, minimum/idéal, limites, activités libres, pauses et voyages, groupes horaires, rappels, chronos, valeurs rapides, abstinences, suivi alcool, règles et imports Health Connect. Seuls la config des widgets et les reports de rappel restent locaux. Aujourd'hui (audit du 2026-10-30), seuls les tâches, projets, zones, étiquettes et la boîte sont synchronisés. Vérif : chaque entité Room a un modèle serveur, une entrée du registre de synchro et une vue web ; un changement sur le téléphone apparaît sur le web et inversement, sans perte, sur SQLite et Postgres.
- Fixtures dorées des habitudes : extraire des tests `domain/` de Cadence des cas JSON (versions d'objectif et de planning + saisies + pauses → statut de chaque période, séries, statistiques). Vérif : les tests Kotlin de Cadence passent sur ces fixtures.

- Revue et entonnoir (`docs/34-review.md`, branche `claude/jolly-brown-jjdogm`) : livré En vue / Cette semaine / Plus tard + date de réexamen, reports classés depuis `task_events` et les plans du jour, page `/review` (6 étapes), capacité hebdo, This or That. Vérif à faire en usage réel : 2 semaines, puis ajuster le seuil (3 en 30 j) et la règle « jour arrivé ou lendemain » si des faux positifs apparaissent.
  - Reste : journaliser `move-occurrence` (report d'une occurrence récurrente) et les modifications d'échéance reçues par `/api/v1/sync` depuis Android (source `device`, à compter comme volontaires) ; la rangée de décision n'existe qu'en Minimal (Dense : menu de la page Revue seulement) ; e2e Playwright du parcours de revue.

## Next

- Refonte TickTick, étape 4 : comparer avec TickTick 8.0.20 lancé en local, écran par écran, lister et corriger les écarts du calendrier (les étapes 1 à 3 et 5 sont dans `main`). À trancher : réordonner les tâches sans heure et retirer du plan en déplaçant la date depuis l'agenda (retirés de l'ancien Aujourd'hui).
- Module habits Cadence côté serveur : schéma, moteur JS, migration des habitudes Tududi existantes en version 1. Vérif : Jest vert sur toutes les fixtures, SQLite et Postgres.
  - Combler les manques de l'amont : versions d'objectif (le passé n'est pas réinterprété), `AT_MOST` > 0 et `TRACK_ONLY`, minimum vs idéal, fréquence + quantité combinées, pauses multi-jours avec motif et reprise anticipée, fuseau observé par saisie, `startsOn`, quantités entières à précision explicite, groupes à plages libres (chevauchement, passage de minuit), chronos, progression de cible, profils d'abstinence, stats 30 jours avec confiance.
  - Garder de l'amont : score de force, note par check-in, présence dans Aujourd'hui/Plan, outils MCP.
- API de synchronisation hors ligne ([plan](docs/fork/PLAN-clients-sync.md), § 1 ; [doc](docs/30-offline-sync.md)). Fait : registre, journal, snapshot, pull, push idempotent, fusion par champ, tags, occurrences récurrentes, QR de connexion. Reste (relecture Codex du 2026-10-29) :
  - Concurrence : sérialiser lecture/fusion/écriture par ligne ; sur Postgres, un curseur peut sauter une entrée non commitée (publier le journal dans l'ordre des commits ou borner le curseur) ; dédoublonnage atomique des occurrences.
  - Compaction du journal, entités habitudes.
- Proposer ces trois ajouts en PR à l'amont.
- UI web habitudes : créer, versionner, mettre en pause et saisir depuis le navigateur.
- App Android (dépôt Cadence, branche `feat/tududi-tasks`, v1.1.0) : tâches hors ligne synchronisées, écrans, widgets Aujourd'hui et ajout rapide, partage vers la boîte, rappels, connexion QR — vérifié sur émulateur contre un serveur local. Reste : habitudes synchronisées (après le module habitudes serveur ; audit du 2026-10-30 : aucune donnée de suivi ne quitte le téléphone, ni habitudes, saisies, pauses, groupes, abstinences, alcool, chronos, Health Connect ; seules les tâches, projets, zones, étiquettes et la boîte sont synchronisés), refonte UI/UX à implémenter d'après les maquettes `~/Dev/Cadence/Cadence.fig` (OpenPencil, 2026-10-30 : style Morphe clair, Aujourd'hui unifié, 4 onglets, widget combiné tâches + habitudes modulable ; widget habitudes inchangé), essai sur le vrai téléphone et le vrai serveur via Tailscale.
  - Intégration APK (2026-10-30), fait : module `:designsystem` (palette, accents), `MainActivity` découpé, barre 5 onglets avec Réglages poussé, module `:calendar` (agendas de l'appareil, lecture seule), moteur des questions apprises (`:domain`/`:data`, Room 24), écran Apparence (thème, accent, couleur libre, Material You, noir pur, appliqué partout), « suivi » → « habitude » (test de garde), Tâches accueil avec événements cochables + permission agenda + bande routine, Réglages › Agendas, Agenda (jour/3 jours/mois/liste, feuille Affichage), questions apprises (réglages par habitude, feuille de réponse, carte, notification quotidienne), abstinence sans économies, base du widget combiné (config, stockage, sélection). Reste, d'après `android/docs/REDESIGN.md` : widget combiné (rendu Glance `TodayWidget`, receiver, écran de config w04, ligne Réglages › Widgets, ancien widget Tâches renommé ; petits widgets ensuite), Agenda : habitudes, plateau « À planifier » et glisser-déposer, flèches de navigation ; toggle « muet pendant les pauses » (champ domaine + migration) ; rail projet sur `TaskRow`. Vérif : essai sur émulateur de chaque écran contre `docs/redesign/*.png` (aucun émulateur lors de l'intégration : vérifié par build et tests seulement).
  - Maquettes v4 (`Cadence.fig`, page « Agenda, habitudes, thèmes ») : barre Boîte · Tâches (accueil) · Agenda · Habitudes · Bilan ; hexagones réservés aux habitudes.
  - Événements d'agenda dans la liste Tâches (comme TickTick) : cochables comme une tâche (marqués faits dans Cadence, Google inchangé), repérés par un rond à la couleur de l'agenda et une icône calendrier ; par agenda, choisir où ils s'affichent (Agenda, liste Tâches, widget).
  - Agenda dans l'app, comme le web : jour, 3 jours, mois, liste ; tâches à planifier glissées dans la journée ; événements Google, habitudes et tâches datées ; choix des calendriers affichés.
  - Questions apprises (abstinences et journaux simples) : repérer les jours et heures où une saisie revient d'habitude, demander le lendemain si elle manque (« Hier, jeudi : avez-vous bu ? » Non / Oui / Oui + verres), réglable par habitude, muet en pause. Vérif : fixtures sur 12 semaines, aucune question quand la saisie existe.
  - Abstinence sans économies : record, écart moyen, écarts sur 30 j à la place du montant.
  - Apparence : thème Système / Clair / Sombre, accent au choix (violet et blanc par défaut, couleur libre, Material You), noir pur en option.
  - Parité web (cœur) : recherche globale, détail de tâche complet (sous-tâches, début, répétition, estimation, report, liens, commentaires, pièces jointes), notes, minuteur focus ; le reste (tableaux, revue, vues, objectifs, personnes) après.
- Import des données Cadence vers Tududi. Vérif : séries et stats identiques avant et après.
- Client Linux Tauri 2 autour du front React : notifications natives, barre système, ajout rapide global, SQLite hors ligne. Vérif : RAM au repos < 100 Mo, notification reçue app fermée dans la barre.
- Passer la production sur le Postgres d'Unraid (export puis import) et lancer les tests sur Postgres.
- Fusionner l'amont (`chrisvel/tududi`) chaque semaine (dernière synchro : `f04288d`, v1.14.0). Proposer en PR les ajouts génériques (vues calendrier, flux ICS de la branche `claude/new-session-sgffz7`).
- TODO.md des dépôts dans Tududi, édition live des deux côtés : un conteneur clone depuis Gitea/GitHub, lit `Now`/`Next`/`Ideas` ; une modification dans Tududi est commitée et poussée, un push dans le dépôt est relu (webhook). Les conflits sont signalés sans écrire. Vérif : une modif de chaque côté apparaît de l'autre sans perte.

## Ideas

- Capture Android : partage vers l'inbox en moins d'une seconde, puis galerie des découvertes (aperçu OpenGraph, README GitHub) avec décision rapide : tester, rattacher, reporter, jeter.
- Enrichissement déterministe sans IA (OpenGraph, README, étoiles), puis Hermes en lot différé (résumé, projet, doublons, résurgence).
- Migration TickTick via son MCP, une fois les rappels prouvés pendant quelques semaines.
- Vues outliner et galerie dans les clients.
