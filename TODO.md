# TODO

Décisions, références et pièges du fork : [docs/fork/DECISIONS.md](docs/fork/DECISIONS.md).

## État actuel
Branche: `main` | Arbre: modifications non commitées
Tests: Android `:tasks` vert, backend todo-md + upgrade verts (2026-11-26)
Bloqueur: aucun
Prochaine action: Vérifier galerie et arborescence sur le téléphone ; lancer « Actualiser les TODO.md » pour remplir l'ordre du tableau ; mesurer le premier « Discuter avec l'IA »

## Now

- [ ] Hermes : mesurer les tokens du premier « Discuter avec l'IA » depuis une fiche de tâche (matin mesuré : ~37 k, `docs/47-proposals.md` « Measured cost ») #perf

## Next

- [ ] Wiki : capture « propositions » (la proposition de semaine ne s'affiche qu'avec un agent IA, absent du compte de démo) #doc
- [ ] i18n : les cartes « À trier » et la revue hebdo sont écrites en français côté serveur (`backend/modules/triage/core/rules/texts.js`), même pour un compte en anglais ; visible sur `screenshots/web/triage.png` #code
- [ ] Vérifier l'APK Android : galerie et arborescence (le reste vérifié par adb le 2026-11-26 : fiche, widget, ajout rapide, Listes, case de fiche, Régularité, synchro hors ligne et conflits, partage, rappels) #humain
- [ ] Android : « Meilleur jour » des statistiques d'habitude affiche « 0 en moyenne, contre 0 » pour une habitude binaire (Bilan › Huile/Crème) #code
- [ ] Android : en ajout rapide avec « Plus d'options », le bouton « Ajouter » passe sous le clavier (la touche ✓ ajoute) #ux
- [ ] Vérifier la refonte UI sur téléphone et web (détail, ajout rapide, Agenda, Bilan, Ctrl+K) #ux
  Agent : émulateur + navigateur.
  - Inclut : Vérifier les retours UX sur téléphone, liens, panneau KDE et add-on Firefox #humain #ux
- [ ] Configurer le connecteur MCP pour claude.ai sur Unraid et Cloudflare (`docs/38-remote-mcp.md`) #humain #infra #secu
- [ ] Configurer les projets TODO.md sur Unraid (`docs/35-todo-md-projects.md`) #humain #infra
- [ ] Configurer et tester la synchro Google pendant 3 jours (`docs/33-google-sync.md`) #humain #infra
- [ ] Évaluer la revue (`docs/34-review.md`) sur 2 semaines d'usage réel #humain
- [ ] Installer le client Linux RPM et configurer le raccourci KDE #humain
  - Inclut : Installer le nouveau RPM et tester un vrai clic sur « Terminé » #humain
  - Inclut : Tester le mode hors ligne du client Linux contre le serveur #humain
- [ ] Configurer Hermès capture et le classement IA en prod (`docs/41-auto-classify.md`) #humain #infra
- [ ] Ouvrir les issues amont et envoyer les PR préparées (`docs/fork/upstream-prs/`) #humain
- [ ] Comparer à l'écran le calendrier Cadence avec TickTick 8.0.20 #ux
  Agent : Pixel par adb, quand il est libre.
- [ ] Faire relire les 22 traductions hors fr/en/ja/ko par des locuteurs natifs #humain #doc
- [ ] Déployer et tester le plugin Hermes sur Unraid (`docs/fork/PLUGIN-GUIDE.md`) #infra
  Agent : Unraid par ssh.
  - Inclut : Configurer `TUDUDI_PLUGINS_DIR` et vérifier les plugins sur Unraid et Android #humain #infra
- [ ] Vérifier la remise de tâche depuis Proches sur Android (`docs/42-proches-handoff.md`)
  Agent : Pixel par adb, quand il est libre.
- [ ] Redéployer l'outil Gmail (`--archive-token-file`) et configurer l'agent Hermes mail #infra
  Agent : Unraid par ssh.
- [ ] Fusionner l'amont (`chrisvel/tududi`) chaque semaine #infra
- [ ] Parité Android -> web : revue rapide une idée à la fois #ux
- [ ] Vérifier le tableau des sous-projets Android sur le téléphone (projet Dev › Tableau, « Actualiser les TODO.md » dans le menu) une fois le serveur publié
  Agent : émulateur.
- [ ] Android : vue « Projets » (portefeuille) du tableau des sous-projets, si elle manque à l'usage #code
- [ ] Vérifier le tableau des sous-projets allégé sur la vraie page Dev (deux vues, État actuel court, bannière repliée) #ux
  Agent : navigateur.
- Connecter avec Google health pour cocher des tâches / habitudes

## Ideas

- Parité amont web seulement : quitter un partage, choisir le repreneur des tâches
- Fixtures dorées des habitudes (abstinence, alcool, aperçus, questions apprises, semaine)
- « Cocher une fois passé » par agenda sur Android
- Limite de projets actifs (compteur seulement)

## Done
- [x] Annuler la série « Weekly Planning » (doublon de « Revue hebdo »)
- [x] Ouvrir la tâche au clic depuis le widget Android #bug
- [x] Signer l'add-on Firefox Cadence en non listé (`web-ext sign --channel=unlisted`) #humain #infra
- [x] Découper une tâche en petites étapes minutées par l'IA (web et Android)

- [x] Un lien seul dans l'ajout rapide Android
- [x] Aujourd'hui sur Android : glisser-déposer pour ranger
- [x] Android : planifier sans toucher l'échéance
- [x] Frise du jour déplaçable sur Android
- [x] Icône de la source sur les tâches (web et Android)
- [x] Mode hors ligne web/Tauri fusionné dans `main`
- [x] Plugins (web et Android)
- [x] Notifications Tauri lisibles sur Fedora
- [x] Rien n'apparaît au survol ; le détail s'ouvre au clic
- [x] Clic sur un bloc ou un événement du calendrier : ouvre la tâche ou l'événement
- [x] Détail de tâche dans un panneau sous la page, pas à droite
- [x] Épinglés en tuiles (icône + nom) au-dessus du mini-calendrier
- [x] Bouton « Calendrier » visible quand le calendrier est caché
- [x] Calendrier sur 1, 3 ou 7 jours, flèches ‹ › pour changer de jour
- [x] Mode sombre retravaillé (anthracite bleuté, blocs nets)
- [x] Réordonner la liste du jour décale aussi les créneaux du calendrier (Sunsama)
- [x] « 7 prochains jours » renommé « Planifier » : mode Jours (tableau, calendrier à droite)
- [x] Planifier, mode Horizons : Cette semaine, Ce mois-ci, Mois prochain, Un jour (façon Akiflow)
- [x] Glisser vers un mois garde le mois sans date précise (`tasks.month_of`)
- [x] Horizon déduit de la date prévue (69744d66)
- [x] Tâches d'un mois remontées dans « à planifier » au début du mois (69744d66) ; Android : même règle dans `TaskViews.unsorted`
- [x] Tâches venues d'un TODO.md : se comportent comme de vraies tâches, sur le web et sur Android
- [x] Popup de tâche : boutons vers son projet et ses étiquettes ; clic dehors ferme
- [x] Bloc du calendrier ouvert surligné ; glisser ou étirer un bloc n'ouvre pas la tâche
- [x] Page « Planifier » (ex-7 prochains jours) : colonne Inbox à gauche, puis jours (tableau), Inbox retirée de la barre latérale
- [x] Android : Planifier (Inbox, Échues, 14 jours, Horizons), « Masquer les terminées » (Aujourd'hui, Planifier) et `tasks.month_of` (Room v18, synchro)
- [x] Style des apps de référence repris sur tout le desktop, pas seulement Aujourd'hui
- [x] Android : reprendre les décisions du style bureau
- [x] Android : horizon « Semaine prochaine » et envoi vers un horizon depuis Jours
- [x] Planifier après la revue UX : 14 jours, En retard, calendrier borné, clavier, ajout rapide, filtres, un « + » par colonne
- [x] Notifications Plasma riches : Terminé, +10 min, Ouvrir ; anneau couleur du projet
- [x] Cloche de notifications masquée dans l'app desktop (côté web)
- [x] Liens externes ouverts dans Firefox depuis l'app desktop + marqueur `CadenceDesktop/` (1a085cc6)
- [x] Inbox de Planifier : « + » crée une tâche ; tâches à classer listées dans la colonne (984ea756)
- [x] Markdown complet, barre de mise en forme (tableaux), liens `[[…]]`, mentions `@` et rétroliens dans notes et descriptions
- [x] Faire relire les traductions des 25 autres langues (relecture IA des 24 langues hors en/fr du web)
- [x] Cases `- [ ]` écrites dans une note : deviennent des tâches liées à la note
- [x] Notes et descriptions éditées en plan (outliner) : puces, Tab avec enfants, repli, zoom, puce -> tâche liée (web)
- [x] Android : notes et descriptions en plan (outliner), repli, zoom, puce -> tâche liée, case qui suit la tâche
- [x] Android : Inbox de Planifier à reprendre avec Planifier
- [x] Note de l'ajout rapide Android : fiche d'ajout retirée avant l'ouverture de l'éditeur
- [x] Note de l'ajout rapide Android : clavier placé dans le contenu quand la note a déjà un titre
- [x] Android : Markdown des notes et descriptions, puces, mentions `@` et rétroliens
- [x] Android : création d'une cible inconnue depuis sa puce, choix `@` des personnes, barre de mise en forme complète
- [x] Statistiques d'habitudes : moteur commun (motifs par jour, mois, 12 mois)
- [x] Statistiques d'habitudes : section « Patterns » web (26 langues, 375 px et bureau)
- [x] Statistiques d'habitudes : panneau « Régularité » Android
- [x] Plan web : « En retard » dans la colonne de gauche, au-dessus de la Boîte de réception
- [x] Plan web : voir les tâches que je repousse sans cesse
- [x] Cartes « Mail » dans « À trier » (serveur, web et Android)
- [x] Refonte Inbox + Liens (web et Android)
- [x] Web : reprendre la passe de soustraction Android
- [x] Sécurité : chiffrer `users.telegram_bot_token` avec `secretCipher`
- [x] PostgreSQL : `npm run db:migrate` après `db-prepare.js`
- [x] Parité web -> Android
- [x] Archiver `docs/fork/CADENCE-PARITY.md`
- [x] Liens : n'extraire que les liens qui portent une vraie action
- [x] Autofocus sur textarea en saisie de note + fermeture du modal lors de l'ajout
- [x] Ouvrir la tâche à froid depuis le calendrier

## Dropped

- V/E/M/D (abandonné : le planificateur Hermès arbitre ; archivé dans la note « Archive V/E/M/D » et `~/Documents/cadence-archives/`)
- Bilan du soir sur Android (remplacé par les agents Hermes dans la Boîte des agents, `docs/39-daily-brief.md`)
- Résumé matinal (remplacé par les agents Hermes dans la Boîte des agents, `docs/39-daily-brief.md`)
- Résumé du jour, retours sur le téléphone (remplacé par les agents Hermes dans la Boîte des agents, `docs/39-daily-brief.md`)
