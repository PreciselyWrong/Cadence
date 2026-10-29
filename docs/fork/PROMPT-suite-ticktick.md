# Prompt : suite de la refonte façon TickTick

À coller dans une nouvelle session Claude Code ouverte dans `/home/nicolas/Dev/Tutudi`.

---

Tu reprends la refonte de Tududi (fork `PreciselyWrong/tududi`) pour qu'il ressemble à TickTick dans toute son UX. Le compte à rebours (Countdown) et ce qui s'en rapproche restent hors périmètre.

## À lire d'abord

- `AGENTS.md`, puis `docs/fork/FORK.md`. Ses règles s'appliquent toutes : section README « 🍴 What this fork adds » et tableau du fork à jour, page `docs/` à chaque changement de comportement, toute nouvelle chaîne dans les 26 `public/locales/*/translation.json`, horodatages de migration uniques, clés `ui_settings` filtrées dans `backend/modules/users/service.js`.
- `docs/fork/DECISIONS.md`, en particulier la refonte UI sur place et le réglage `ui_settings.appearance.density` : `minimal` par défaut, `dense` pour l'affichage de l'amont. Chaque changement visuel passe par `useIsMinimal()` (`frontend/hooks/useUiDensity.ts`). En mode `dense`, rien ne change.
- TickTick sert de référence pour le comportement uniquement : on n'en copie ni le code, ni les icônes, ni les assets, ni les textes. TickTick 8.0.20 est installé dans `/opt/TickTick`, on peut le lancer pour comparer.

## Façon de travailler (demandée par Nicolas)

- Le code est écrit par des sous-agents **Haiku** (`Agent`, `model: "haiku"`, `isolation: "worktree"`). Tu gardes la conception, la relecture, les tests et la vérification dans le navigateur.
- Chaque brief commence par `git merge --ff-only main`, puis crée un lien symbolique vers `node_modules` du checkout principal. Il donne les fichiers exacts, le comportement attendu et les tests à écrire avant le code.
- **Jest toujours avec `-w 2`, sur des fichiers ciblés.** Une exécution complète non bridée a consommé environ 50 Go de RAM.
- Intégration : cherry-pick sur `main`, ajout du trailer `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>` s'il manque, puis typecheck, tests touchés et vérification des JSON de traduction.
- Vérifie chaque étape dans le navigateur avec une base jetable. `.claude/launch.json` contient `tududi-verify-backend` (:3310, `DB_FILE=db/verify.sqlite3`) et `tududi-verify-frontend` (:4180), et l'utilisateur de test e2e. Ne touche jamais `backend/database.sqlite`. Redémarre le front après une fusion : un ancien bundle en erreur de compilation fait croire à des bugs.
- Avant de pousser : `npx tsc --noEmit -p .`, `npm run lint`, `npx jest -w 2 frontend`, plus les tests backend touchés. Nicolas confirme chaque push.
- Commits en français ou en anglais, préfixe conventionnel en minuscules.

## Déjà fait (sur `main`, poussé jusqu'à `9b25e43f`)

- Aujourd'hui = planificateur intégré :
  - candidats à gauche, avec le cercle pour terminer ;
  - à droite, le mode Planning (timeline) ou Calendrier (vue jour), que l'on peut masquer ;
  - navigation jour par jour avec `?date=` ;
  - démarrage automatique du plan ;
  - glisser-déposer avec dnd-kit : liste → heure, journée entière ↔ heure, redimensionnement ;
  - `/today/plan` redirige vers `/today`.
- Heures visibles réglables (`ui_settings.calendar.visibleHours`), avec les barres « ▲ N earlier / ▼ N later » pour révéler ce qui est caché.
- Lignes de tâche en mode minimal :
  - cercle coloré selon la priorité, à gauche ;
  - une seule ligne : #tags, projet, date colorée ;
  - drapeau de priorité et date modifiables sans ouvrir la tâche.
- Panneau de détail à droite (`?task=`) avec édition en place.
- Barre latérale : listes intelligentes avec compteurs (`GET /api/tasks/smart-counts`), domaines en dossiers, rail d'icônes, menu « More ».
- Sous-projets (`projects.parent_project_id`, profondeur illimitée, le domaine suit le parent) ; tags imbriqués sur un niveau (déjà dans l'amont du fork).
- Barres de défilement fines, réglage Minimal/Dense.

## À faire, dans cet ordre

Chaque étape vaut un commit (ou une branche) et est vérifiée dans le navigateur.

1. **Ajout rapide en langage naturel** (étape 2 du plan TickTick).
   - Dans la saisie rapide (`frontend/components/Inbox/QuickCaptureInput.tsx`, `frontend/utils/inboxTokens.ts`), reconnaître pendant la frappe : date et heure en français et en anglais (« demain 15h », « lundi », « dans 3 jours », « tomorrow 3pm »), `#tag`, `!1`/`!2`/`!3` pour la priorité, `^liste` pour le projet. Surligner les éléments reconnus.
   - Entrée crée la tâche avec ces champs remplis.
   - Ajouter un champ « + Ajouter une tâche » en haut des listes en mode minimal (Aujourd'hui, Toutes, projet, tag), et une section « Terminées » repliée en bas.
   - Vérif : « Appeler Paul demain 15h #perso !1 ^Maison » met en surbrillance 4 éléments et crée la tâche complète.
2. **Gestes sur les lignes** (étape 3) :
   - sous-tâches repliables ;
   - sections repliables ;
   - menu clic droit (priorité, date, déplacer, épingler, supprimer) ;
   - glisser pour réordonner, et glisser sur un projet de la barre latérale pour changer de liste ;
   - raccourcis clavier (flèches, Espace pour terminer, Entrée pour ouvrir, `D` pour la date, `P` pour la priorité).

   Vérif : chaque geste marche sur Tâches, Aujourd'hui et un projet, et l'ordre est conservé après rechargement.
3. **Type de vue par vue** (étape 4, comme Todoist) :
   - Liste / Tableau / Calendrier pour Aujourd'hui, un projet, un tag et les vues enregistrées, avec un choix mémorisé par vue ;
   - création libre de vues (filtres enregistrés).

   Vérif : chaque vue change de type et retrouve son choix.
4. **Écarts calendrier restants** (étape 5) : comparer avec TickTick 8.0.20 lancé en local, écran par écran, puis lister et corriger. Partir de l'analyse dans `ticktick-vs-tududi.md`, qui est dans le scratch de la session « TickTick reverse engineering » ; en grande partie déjà traité.
5. **Restes et petites dettes :**
   - Le panneau de détail ne met à jour la liste en direct que sur `Tasks.tsx`. Écouter l'événement `tududi:task-updated` dans Aujourd'hui, À venir, la page Projet et la page Tag.
   - Le menu « Heures visibles » ne se ferme pas avec Échap.
   - Mode Planning : pas encore de barre « ▲ N earlier » pour les tâches horodatées non planifiées hors de la plage. Pas de bouton « Afficher toutes les heures » dans le menu « ⋯ ».
   - Fonctions de l'ancien Aujourd'hui à rétablir (accord de Nicolas) : réordonner les tâches sans heure, retirer du plan en déplaçant la date depuis l'agenda.
   - Les nouvelles traductions (26 langues) sont écrites par des agents. Le README doit les signaler comme non relues.
6. Ensuite, le `Now`/`Next` de `TODO.md` : fixtures dorées des habitudes Cadence, module habits côté serveur, etc.

Commence par confirmer à Nicolas l'étape 1 et son critère de vérification, puis lance le premier sous-agent Haiku.
