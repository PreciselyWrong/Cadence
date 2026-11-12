# Refonte d'Aujourd'hui (2026-11-12)

Référence de conception de la refonte de la page Aujourd'hui et du design system qui en sort. Les décisions durables sont reportées dans `DECISIONS.md`, le comportement dans `docs/20-daily-plan.md`.

## Diagnostic

Constaté sur l'application lancée (base jetable, 8 tâches prévues, 1440, 1024 sombre, 375 px) et dans le code.

**Structure**

- La colonne de gauche n'affiche que les *candidates* (tâches pas encore prévues) : avec 8 tâches prévues, elle dit « Nothing here. Nice. ». Les tâches du jour ne vivent qu'à droite, dans le planning, et celles sans horaire sont reléguées sous la grille.
- Cinq représentations du « plan du jour » : le plan (`daily_plan_items`), l'ordre des candidates (`today_order`), les blocs des tâches à échéance horaire, le brouillon IA, le résumé du matin. Plus la carte « Next », la liste « Agenda » et la vue liste du plan.
- Deux navigations de date, deux boutons « Aujourd'hui », jusqu'à 9 contrôles dans l'en-tête, puis citation, guide, carte du résumé et carte du bilan empilés au-dessus du contenu.
- Sur téléphone, la grille horaire commence après toute la liste des candidates.

**Comportement (données)**

- P0 : déposer, déplacer ou redimensionner une tâche dans le calendrier d'Aujourd'hui réécrit son échéance (`dropToDueUpdate`, `moveUpdate`), ce qui déplace aussi son rappel implicite et son reflet Google ; la tâche n'entre même pas dans le plan.
- P0 : « Demain » change l'échéance sur le web, seulement le plan dans le bilan du soir, efface l'échéance dans « Plus tard » sur Android.
- P1 : les durées estimées par l'IA ou par « Tout placer » sont écrites dans la tâche sans revue ni annulation ; un redimensionnement de bloc ne met pas l'estimation à jour : une tâche peut avoir trois longueurs.
- P1 : le plan s'écrit en remplaçant toute la liste (`PUT /daily-plan/:date`), sans contrôle de concurrence entre web, Android et MCP ; un échec d'écriture web ne revient pas en arrière.
- P1 : l'horloge d'aujourd'hui s'applique aux autres jours (carte « Next », ligne rouge, recherche de créneau du `+`).
- P1 : le réglage d'affichage « Heures visibles » réduit aussi le temps planifiable.
- P1 : `today_order` est un rang global jamais remis à zéro.

**Visuel**

- Jetons (tokens) calqués sur Android, mais 531 usages sémantiques contre ~8 900 `gray-*` et ~1 400 `blue-*` ; 36 arrondis, 8 ombres, ~250 tailles de texte arbitraires. Surfaces teintées lavande.
- Aucun bouton, menu, popover ou pastille partagé ; chaque écran refait ses contrôles.

**Interaction**

- Glisser-déposer : souris seulement pour le redimensionnement, pas de capteur tactile ; bouton de retrait inaccessible au clavier.
- Pas d'annulation pour retirer du plan, reporter, déplacer, redimensionner.

**Dette qui bloque l'UX**

- `TodayPage.tsx` : 2 806 lignes, ~38 états, ~60 gestionnaires, aucun cache de données ; chaque enregistrement depuis la fiche recharge toute la journée.

## Modèle : cinq notions, cinq champs

Aucune nouvelle colonne : le modèle existe déjà, c'est l'interface qui le mélange.

| Notion | Donnée | Écrite par |
|---|---|---|
| Jour prévu (intention) | ligne de `daily_plan_items` pour la date | ajouter au jour, reporter, retirer du jour |
| Échéance | `tasks.due_date` (+ `due_has_time`) | seulement l'éditeur « Échéance » (fiche, menu de la ligne) |
| Créneau | `daily_plan_items.start_minute` | glisser dans le calendrier, déplacer, retirer l'horaire |
| Durée | `tasks.estimated_minutes`, recopiée dans `daily_plan_items.duration_minutes` | redimensionner un bloc, puces de durée, fiche |
| Rappel | `tasks.reminder_at` | la fiche seulement |

Règles (révisées après relecture critique, voir « Relecture ») :

1. Rien dans Aujourd'hui (glisser, redimensionner, reporter, organiser) n'écrit l'échéance. Le menu qui la change le dit : « Échéance → demain ».
2. Membre du jour (validé) : les tâches prévues ce jour, plus celles dues ce jour qui ne sont prévues à aucun autre jour à partir d'aujourd'hui. Une seule fonction serveur, la même pour web, Android, MCP et le résumé.
3. Un seul ordre manuel : la position du plan. Réordonner ne crée pas de ligne de plan.
4. Reporter une tâche du jour = créer ou déplacer sa ligne de plan vers le jour choisi ; l'échéance reste, rappelée par un repère sur son jour.
5. Redimensionner un bloc change la durée de cette ligne de plan seulement. L'estimation de la tâche sert de durée par défaut et ne change que depuis la fiche ou les puces de durée. Les durées devinées (IA, valeur par défaut) ne sont jamais écrites dans la tâche.
6. Une tâche à échéance horaire sans créneau reste dessinée à son heure, sur sa durée estimée, comme un rendez-vous : elle compte comme occupée pour le placement automatique (souvent un vrai rendez-vous saisi par « demain 15h »). La glisser lui donne un créneau et laisse un repère fin d'échéance. Rien n'est réinterprété dans les données existantes.
7. Retirer le créneau garde la tâche dans le jour. Retirer du jour garde la tâche.

Écritures : `PATCH /api/daily-plan/:date` avec une liste d'opérations (`add`, `remove`, `slot`, `unslot`, `resize`, `reorder`, `move`), appliquée en une transaction, vérification de chevauchement contre tout le plan dans la transaction. `PUT` garde son comportement et accepte une précondition facultative (`If-Match`, empreinte du plan, 409 si périmé) ; sans en-tête, rien ne change pour les anciens APK. `carryOver` et `setTaskOnToday` (MCP, API `today`) passent par les mêmes opérations.

## Structure de la page (bureau)

`[ Navigation ] [ Liste du jour ] ⋮ [ Calendrier du jour ]` — séparateur redimensionnable, largeur mémorisée ; calendrier visible par défaut à partir de 1 100 px, sinon accessible par un bouton (panneau qui se superpose), et masquable.

**En-tête de la liste** (une seule navigation de date)

- « Aujourd'hui » (ou le jour), la date en dessous, `‹ ›` discrets, retour « Aujourd'hui » quand on est ailleurs.
- Une ligne de résumé : « 8 tâches · 4 h 40 ». Elle devient « 4 h 40 prévues pour 3 h libres » en ambre seulement si la journée déborde ; détail au survol. Pas de jauge.
- Un bouton « Organiser » (placement automatique) quand des tâches sans horaire tiennent dans le temps libre ; `⋯` pour le reste (décaler la suite, plages protégées, heures, résumé du jour, bilan du soir, brouillon IA).

**Corps de la liste**

1. Ajout rapide en tête (langage naturel existant), Entrée ajoute au jour.
2. « En retard (n) » replié, en tête, seulement s'il y en a ; « Reprendre aujourd'hui » prévoit sans toucher l'échéance.
3. Les tâches du jour, une ligne chacune : celles qui ont un créneau dans l'ordre horaire, l'heure dans la marge gauche ; puis les autres dans l'ordre manuel. La tâche en cours porte l'accent.
4. Un signal contextuel quand un créneau est dépassé : « Rédiger… a dépassé son créneau · Décaler la suite · Plus tard ». Remplace la carte « Next » et les conseils.
5. « Suggestions (n) » replié : prochains jours, cette semaine, Inbox ; `+` ou glisser pour prendre.
6. « Terminées (n) » replié.

**Ligne de tâche** : case · titre · contexte (projet) en gris · durée ; heure à gauche si créneau ; drapeau seulement pour une priorité haute ; échéance seulement si elle n'est pas le jour même ou si elle a une heure. Au survol ou au focus : planifier, reporter, `⋯`. Clic : fiche latérale (`?task=`), contexte gardé.

**Calendrier** : grille horaire lisible (heures visibles réglables, barres « N plus tôt / plus tard »), ligne bleue « maintenant » seulement aujourd'hui, ligne « journée entière » pour les événements sans heure, événements des agendas (gris, non déplaçables sauf Google en double sens), blocs des tâches (couleur d'accent légère, case pour terminer), plages protégées hachurées, repères d'échéance, chevauchements en colonnes. Le calendrier suit la date de la liste ; pas de navigation propre.

**Passé** : la liste devient le compte rendu du jour (fait, non fait) ; le calendrier reste consultable.

## Interactions

| Geste | Effet | Annulation |
|---|---|---|
| Cocher | terminée dans les deux vues, ligne barrée puis rangée dans « Terminées » | toast « Annuler » (restaure aussi l'échéance d'une récurrente) |
| Glisser liste → calendrier | créneau à l'heure visée, au quart d'heure, durée de la tâche ou 30 min | toast |
| Glisser un bloc | nouveau créneau | toast |
| Tirer le bord bas | nouvelle durée (tâche) | toast |
| Glisser un bloc vers la liste, ou `Suppr` sur un bloc | retire le créneau, reste dans le jour | toast |
| Glisser une ligne dans la liste | ordre manuel (tâches sans horaire) | — |
| `⋯` Reporter → Demain / Semaine prochaine / Choisir | ligne de plan déplacée ; échéance intacte | toast |
| Organiser | aperçu des créneaux proposés, Appliquer | toast « Tout annuler » |
| Clavier | ↑↓ se déplacer, Espace terminer, Entrée ouvrir, `T` planifier (heure), `D` reporter, `Maj+↑↓` créneau ±15 min, `Alt+↑↓` durée ±15 min, `Suppr` retirer le créneau | toast |
| Tactile | appui long pour saisir ; menu de ligne pour tout le reste | — |

Optimiste partout où c'est sûr ; en cas d'échec, retour à l'état serveur et message qui dit quoi faire.

## Planification automatique

Le moteur existe côté web (`planUtils.findFreeSlot`, `autoPlace.planAll`, `shiftFollowing`, `placeLater`) : on le garde et on corrige ses entrées.

- Temps libre = heures de travail (`ui_settings.planning.dayHours`) moins événements occupés, plages protégées, créneaux déjà pris, et le temps écoulé pour aujourd'hui. Les heures visibles du calendrier n'y entrent plus.
- Ordre : échéance (heure puis jour), priorité, ordre manuel.
- Ne déplace jamais un événement, une tâche déjà placée à la main (sauf « Décaler la suite » demandé), une échéance ou une récurrence.
- Toujours un aperçu, puis un toast « Tout annuler ». Les durées devinées restent dans le plan, pas dans la tâche.

## Bruit retiré de la vue par défaut

| Élément | Devient |
|---|---|
| CandidateList (colonne) | sections « En retard », « Suggestions » de la liste |
| PlanList, AgendaList, mode liste/planning | une seule liste ; le calendrier fait l'agenda |
| NowCard | accent sur la ligne en cours + signal de créneau dépassé |
| PlanTips | signal de surcharge dans le résumé, signal de créneau dépassé |
| CapacityMeter | texte du résumé, ambre seulement en surcharge |
| StartOfDay | `⋯ › Préparer ma journée`, facultatif |
| BriefCard | entrée « Résumé du jour » dans `⋯` et pastille discrète tant qu'il n'est pas lu |
| WrapUpCard | `⋯ › Bilan du soir`, panneau ; une ligne discrète en fin de liste le soir |
| Citation | retirée |
| Deuxième navigation de date, bascule Jour/Agenda | retirées |

## Design system

Direction : outil de travail calme. Surfaces neutres chaudes, une seule couleur d'accent, typographie qui porte la hiérarchie, peu de bordures.

- Surfaces : gris neutres légèrement chauds à la place des gris lavande (`--gray-*`, `--color-surface*`, Android `Color.kt` dans le même commit). Sombre : gris anthracite neutre, pas de bleu nuit.
- Accent : celui de l'utilisateur (`appearance.ts`), réservé à l'état actif, la sélection, la tâche en cours et l'action principale.
- Couleurs de projet : pastille de 6 px, jamais un fond de ligne.
- Texte : Inter ; 3 rôles (titre de page 22/28 semi-gras, texte 14/20, métadonnée 12/16 gris), chiffres tabulaires pour les heures et durées.
- Rythme : espacement de 4 px ; lignes de 36 px (44 px au toucher) ; arrondis 6 (contrôles), 10 (panneaux), 14 (dialogues).
- Primitives partagées, dans `frontend/components/ui/` : `Button`, `IconButton`, `Menu` (clavier, Échap, toucher), `Chip`, `Kbd`, plus la ligne de tâche. Les écrans existants les adoptent au fil de l'harmonisation.
- Mouvements : 120–180 ms, pas de rebond, `prefers-reduced-motion` respecté.

## Mise en œuvre

1. Serveur : opérations de plan par élément (tests d'intégration SQLite + Postgres).
2. Nouvelle page dans `frontend/components/Today/`, l'ancienne gardée derrière `?classic=1` le temps de la migration, puis retirée.
3. Jetons et primitives, appliqués d'abord à Aujourd'hui, puis navigation, Inbox, listes, fiche, projets, calendrier, capture.
4. Android : mêmes règles (reporter = plan, glisser = créneau), inscrit dans `TODO.md` (`Now`) tant que ce n'est pas livré.

## Relecture (2026-11-12)

Relecture adversariale (sous-agent Opus) des règles du premier jet. Retenu :

- Le hook `leaveOnMove` (`DECISIONS.md`, 2026-11-01) retire une tâche du plan quand son échéance passe plus tard : une modification d'échéance change le jour prévu, à l'inverse du principe. Android « Reporter » s'appuie dessus (il écrit l'échéance).
- Android écrit l'échéance pour « Reporter » et « Placer », et efface l'échéance pour « Plus tard » (`PlanningChanges.kt`).
- Les tâches à heure fixe sont souvent des rendez-vous (ajout rapide « demain 15h », récurrentes à heure fixe) : les traiter en simples repères ferait placer du travail par-dessus. D'où la règle 6 révisée.
- Écrire l'estimation au redimensionnement mélange créneau et durée (récurrentes, plans sur plusieurs jours, reflet Google). D'où la règle 5 révisée.
- Des opérations par élément seules ne suppriment pas la course : Android et `carryOver` remplacent toute la liste. D'où la précondition et les opérations côté serveur.
- Deux ordres manuels (web : plan, Android : `today_order`) ; quatre définitions d'« aujourd'hui » (web, API, MCP, Android, résumé).
- Annuler une occurrence récurrente terminée n'a pas d'opération serveur ; un rappel au créneau ne sonne que sur le téléphone.

## Décisions validées (2026-11-12)

1. Membre du jour : prévues ce jour + dues ce jour non prévues à un autre jour à partir d'aujourd'hui (règle 2 proposée).
2. Hook `leaveOnMove` supprimé ; Android « Reporter », « Plus tard » et « Placer » écrivent le plan, dans la même étape, construit et installé sur le téléphone.
3. Page Calendrier alignée : glisser dans une grille horaire réserve un créneau, l'échéance ne change que par son éditeur (après la page Aujourd'hui).

## État au 2026-11-12 (reprise)

Commits de la refonte : 27638719 (ops du plan + ETag), e770205d (`GET /daily-plan/day`, chevauchements), aac1dd34 (page Aujourd'hui, coque), f970d8c8, 494aa660 (Détails, sous-tâches), aa0809e7 (sous-tâches datées), e33c5f65 (feuille de détail, Demain = Aujourd'hui+1, Inbox en tête), bbcdba68 (tâches TODO.md modifiables, serveur + web), e0d55b8c (feuille : liens projet/étiquettes, clic dehors ; bloc ouvert surligné).

En cours / à faire (liste vivante : `TODO.md` › « Retours en direct ») :
- Page « Planifier » (`/upcoming`, ex-« 7 prochains jours ») : colonne Inbox à gauche, une colonne par jour en cartes (Sunsama), calendrier à droite, bascule Jours | Horizons ; code dans `frontend/components/Upcoming/` (sous-agent, pas commité au moment d'écrire).
- Horizons : Cette semaine / Ce mois-ci / Mois prochain / Un jour ; nouvelle colonne « mois visé » sur la tâche (validé), synchronisée, indexée ; Android aussi.
- Icône de la source (Gmail…) sur les tâches ; cases `- [ ]` d'une note → tâches liées.
- Android pas commité : `planning/PlanEdits.kt` (plan au lieu de l'échéance), suppression serveur de `leaveOnMove.js`, tâches TODO.md modifiables (`swipe/FileBackedActions.kt`…). Les fichiers Android et le résumé du 9 novembre (`brief/*`, `DailyBrief/*`) portent aussi des changements non commités de l'utilisateur : ne pas les mélanger.
- `AppLauncherModal.test.tsx` échoue déjà avant la refonte (2 tests).
- Serveur de vérif : `.claude/launch.json` › `cadence-today-verify-backend` (:3312, `db/verify-today.sqlite3`) + `cadence-mcp-verify-frontend` (:4180) ; compte test@tududi.com / password123. `backend/dist/locales` doit être recopié depuis `public/locales` après un ajout de chaîne.
