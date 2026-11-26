# Plan : Tour de contrôle Kanban multi-sous-projets, Handoff et capture anti-limbes

Objectif : transformer l'onglet `Tableau` d'un projet parent (ex. `Dev` avec ~50 sous-projets) en tour de contrôle Kanban Desktop-first (utilisable proprement sur Mobile), intégrer automatiquement `## État actuel` du skill `handoff` depuis les `TODO.md`, et éliminer le « trou noir » des tâches capturées depuis Android.

## Décisions directrices

- Pas de nouvelle page concurrente : tout vit dans l'onglet `Tableau` existant de `ProjectDetails.tsx`, avec la liste « Sous-projets » du dessus repliable (et repliée par défaut en mode `Tableau` avec sous-projets actifs).
- Deux altitudes distinctes, accessibles en 1 clic via des vues/onglets enregistrés (façon GitHub Projects v2) :
  - **Exécution** (`1 colonne = 1 sous-projet`, filtré par défaut sur les sous-projets actifs `in_progress`, ou `tâches agrégées` par statut/tag/priorité).
  - **Portefeuille** (`1 carte = 1 sous-projet`, colonnes par statut de projet, tag ou priorité, avec compteur WIP visuel non bloquant et tiroir latéral « Voir »).
- Respect strict de `backend/modules/todo-md/policy.js` : sur une tâche `TODO.md`, ajout et coche autorisés, changement de projet bloqué proprement côté UI et serveur.
- Zéro référence privée dans le code ou les docs versionnés.

## Suivi d'avancement

### Phase 1 : Socle backend (Handoff auto + Arbre de sous-projets)
- [x] **1.1** Parser `## État actuel` dans `backend/modules/todo-md/parser.js` : exclure la section de la création de tâches et extraire `{ branch, working_tree, tests, blockers, next_action, raw, updated_at }` (TDD).
- [x] **1.2** Migration idempotente `safeAddColumns` pour `projects.handoff_state` (JSON, nullable) + déclaration dans `backend/models/project.js`, sérialisation dans `backend/modules/projects/` et synchronisation dans `backend/modules/todo-md/service.js`.
- [x] **1.3** Endpoint `GET /api/projects/:uid/board-tree` : retourne le projet, tous ses sous-projets descendants (`descendantIds`) avec `handoff_state`, statuts, tags, compteurs, `next_task`, et leurs tâches ouvertes (+ autorisations `hasAccess`).
- [x] **1.4** Vérification Phase 1 : Jest ciblé `todo-md` + `projects` + tests upgrade schéma, puis commit d'étape.

### Phase 2 : Tour de contrôle Kanban dans `ProjectDetails` › `Tableau` (Desktop-first)
- [x] **2.1** Liste « Sous-projets » du dessus dans `ProjectDetails.tsx` : repliable (`Sous-projets (N) ▾`), repliée automatiquement quand `Tableau` affiche les sous-projets, préférence mémorisée.
- [x] **2.2** Moteur pur `frontend/components/Project/Board/boardModel.ts` (TDD) : construction des colonnes pour les 3 modes (`by_subproject`, `portfolio` par statut/tag/priorité, `tasks` par section/statut/tag/priorité), filtres, swimlanes, WIP, masquage colonnes vides, presets par défaut.
- [x] **2.3** UI `Tableau` enrichie (`ProjectControlBoard.tsx` + `SubProjectDrawer.tsx` + `BoardInboxColumn.tsx` + `boardStorage.ts`) :
  - Option « Inclure les sous-projets » activée par défaut (`ui_settings.projectBoards`, surchargeable par projet).
  - Barre d'onglets / vues enregistrées (Actifs 1 col/projet, Portefeuille, Tâches par statut/tag, En pause) + création/sauvegarde/suppression de vues.
  - Mode `1 colonne / sous-projet` : en-tête avec statut, compteur, pastille `handoff` (branche, bloqueur, prochaine action), ajout rapide `+`, coche, drag-and-drop (garde-fou `TODO.md`).
  - Mode `Portefeuille` : cartes projet avec `handoff`, avancement, prochaine action, bouton « Voir » ouvrant le **tiroir latéral** (tâches ouvertes, ajout rapide, bloc handoff complet), drag-and-drop pour changer statut/tag/priorité.
  - Mode `Tâches agrégées` : colonnes par statut de tâche, tags choisis, priorité ou sections.
  - Colonne « Captures / À classer » à gauche (toggle 1 clic) : idées Inbox + tâches `needs_when`, glissables vers un sous-projet.
  - Menu « Affichage » : colonnes repliables en rail vertical, limites WIP visuelles, densité (`compact` / `normal` / `détaillé`), champs de carte configurables, masquer colonnes vides, recherche `/` + filtre « Capturées 7 j », raccourcis clavier (`/` recherche, `Espace` aperçu tiroir, `Échap` fermer).
- [x] **2.4** Vérification Phase 2 : tests Jest/RTL (`boardModel`, `ProjectBoard`, `ProjectControlBoard`) + `tsc --noEmit`, puis commit d'étape.

### Phase 3 : Ergonomie Mobile (Web responsive) + Capture Android anti-limbes
- [x] **3.1** Mode mobile (390 px) du `Tableau` : barre d'onglets de colonnes en haut, 1 colonne pleine largeur, sélecteur de statut sur les cartes, tiroir plein écran.
- [x] **3.2** Capture Android anti-limbes (`android/tasks/.../ui/QuickAddSheet.kt` + `QuickAddTarget.kt`) : conserver `needsWhen = true` pour toute tâche capturée sans date/horizon (même avec `+projet` ou `~domaine`) + toast explicite indiquant la destination exacte.
- [x] **3.3** Vérification Phase 3 : Gradle `:tasks:testDebugUnitTest :app:assembleDebug` réussi.

### Phase 4 : Locales, Documentation et Parité
- [x] **4.1** Ajouter toutes les nouvelles chaînes d'interface dans les 26 `public/locales/*/translation.json`.
- [x] **4.2** Mettre à jour `docs/fork/DECISIONS.md` et ce plan.
- [x] **4.3** Vérification finale : `npm run lint`, tests backend/frontend/Android ciblés, `npm run build`, puis commit final.
