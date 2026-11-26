# Audit UX du client web (bureau)

Audit en lecture seule du client web sur bureau (1440 x 900 et 1024 x 700, clair et sombre), base de démonstration (`npm run db:seed:screenshots`), interface en français, le 2026-11-26. Chaque constat a été vu dans l'application ou sur sa capture, puis localisé dans le code. Déjà corrigé le même jour et non repris ici : glisser sous Firefox, carte entière du Tableau qui ouvre la fiche, compteur libellé, barre horizontale du Tableau.

Sévérité : **P0** bloque une tâche, **P1** friction quotidienne, **P2** finition. Taille : **S** moins d'une heure, **M** une demi-journée, **L** plus.

## Verdict

1. La base est bonne : Aujourd'hui avec sa grille, Planifier, la palette Ctrl+K contextuelle, la recherche à facettes, l'annulation après suppression et le thème sombre tiennent la promesse « Things 3 / TickTick ».
2. Ce qui casse l'impression d'outil fini, c'est surtout la langue : toast de fin de tâche en anglais, dates anglaises (Tableau, panneau du projet, feuille de route), « Add », « Filter », « New », « Nom » et « Prénom » inversés.
3. Plusieurs écrans montrent une information fausse ou cachée : « Rien de prévu » pendant le chargement, vue Mois qui avale les tâches au-delà de 3, sous-projet absent du Tableau, carte d'habitude pleine marquée « À faire ».
4. La densité dérape par endroits : l'heure répétée trois fois sur une ligne d'Aujourd'hui, l'en-tête de projet qui prend la moitié de l'écran, la barre latérale de 317 px à 1024, des drapeaux vides sur chaque ligne.
5. Le clavier est bien servi (raccourcis, aide `?`, J/K), mais fermer la fiche perd la position, le rail change d'ordre selon la page et une ligne survolée passe par-dessus la fiche ; 41 corrections sur 46 sont de taille S (moins d'une heure).

## Constats transverses

### Dates en anglais dans l'interface française (P1, S)

- **Vu** : « Tue, Nov 24 » sur les cartes du Tableau d'un projet ; « Dec 21, 2026 » (Échéance) et « Nov 26 » (date des notes) dans le panneau Infos du projet ; « Nov 26 au Nov 28 », mois « Oct Nov Dec » sur la feuille de route ; dates d'objectif et de la frise Tout le monde.
- **Correctif** : passer la locale date-fns de l'utilisateur à chaque `format(...)` (comme `Project/ProjectHistory.tsx:341`) et `i18n.language` au lieu de `'en'` codé en dur.
- **Où** : `Project/Board/ProjectControlBoard.tsx:769` (`'en'` codé en dur) ; `Project/ProjectOverviewRail.tsx:491`, `:517`, `:640` ; `Roadmap/RoadmapChart.tsx:156`, `:531` ; `Goal/GoalHero.tsx:138` ; `Everyone/EveryoneTimeline.tsx:309`, `:310`, `:389` ; `Insights/FocusStats.tsx:174` ; `CalDAV/ConflictResolver.tsx:200`, `:323`.

### Chaînes non traduites (P1, S)

- **Vu** : champ de filtre du Tableau « Filter (/ ) » (clé `common.filter` absente en français, la valeur de repli anglaise s'affiche) ; « 1 dans le stash » sous le titre Projets (anglicisme).
- **Correctif** : ajouter `common.filter` (« Filtrer (/) ») ; remplacer « stash » par « en réserve » ou « en pause ».
- **Où** : `Project/Board/ProjectControlBoard.tsx:1266` ; `public/locales/fr/translation.json:2640`.

### Libellés techniques bruts dans les vues enregistrées (P1, S)

- **Vu** : sous chaque vue de `/views`, « high · next week · Task », « today · Task », « Task · Note » : valeurs internes de priorité, d'échéance et de type affichées telles quelles.
- **Correctif** : traduire chaque morceau du résumé par les clés existantes (priorités, horizons de date, types d'entité) avant le `join(' · ')`.
- **Où** : `View/ViewRow.tsx:61-69`.

## Planifier (`/today/plan`, aussi l'atterrissage de `/inbox`)

### Puces tronquées jusqu'à l'illisible sur les cartes (P1, S)

- **Vu** : sur les cartes des jours et de la Boîte, la puce de projet et la puce d'étiquette se partagent une largeur fixe : « Lancement ... », « #.. », « Rénov... », « R... » à 1024. La puce ne dit plus rien et ajoute du bruit à chaque carte.
- **Correctif** : n'afficher qu'une seule puce (le projet, sinon l'étiquette) sur une carte de colonne, ou masquer la puce d'étiquette quand la place manque (largeur minimale avant `truncate`).
- **Où** : `Shared/task/TaskCardBody.tsx:156-176`.
- **Taille** : S.

### « Cette semaine » passe sur deux lignes et chevauche la charge (P2, S)

- **Vu** : en-tête d'horizon « Cette semaine » coupé en deux lignes, la charge « 13 h 20 / 40 h » collée au titre, à 1440 comme à 1024 (colonne gauche de 250 px).
- **Correctif** : `whitespace-nowrap` sur le titre et passer la charge (`headerExtra`) sous le titre quand la colonne est étroite.
- **Où** : `Upcoming/HorizonColumn.tsx:151-183`.

## Fiche de tâche (tiroir commun)

### Titre long coupé sans retour à la ligne (P1, S)

- **Vu** : « Rédiger la note de rétrospective design Q » : le titre est un champ sur une ligne, la fin disparaît à droite du tiroir.
- **Correctif** : passer le champ titre en multiligne auto-dimensionné (Entrée valide toujours).
- **Où** : `Task/TaskEditorBody.tsx:178-181` (`multiline={false}`).

### Projet et étiquettes affichés deux fois (P2, S)

- **Vu** : en haut du tiroir, liens « Refonte du site client » et « en-attente » ; juste dessous, puces « Refonte du site client » et « #en-attente ». Contraire à la règle « une information une fois par écran ».
- **Correctif** : garder les puces du corps (elles éditent) et retirer la navigation d'en-tête, ou rendre la puce cliquable vers la page (clic sur le nom, crayon pour changer).
- **Où** : `Task/TaskPane.tsx:364-410`.

### Phrase de reports maladroite (P2, S)

- **Vu** : « Déplacée 3 fois, dont 3 ces 30 derniers jours · 22 nov. ».
- **Correctif** : quand les deux nombres sont égaux, « Déplacée 3 fois ces 30 derniers jours » ; sinon « Déplacée 5 fois (3 ces 30 derniers jours) ».
- **Où** : `Review/PostponementHistory.tsx:93`, clé `postponements.summary`.

## Navigation (barre latérale)

### Le rail d'icônes change d'ordre selon la page (P1, S)

- **Vu** : sur Aujourd'hui, Projets ou Toutes les tâches, le rail montre 8 icônes (Notes en premier) ; sur Notes ou Habitudes, il en montre 10 (Aujourd'hui en premier, Zones en cinquième). Chaque icône glisse d'une ou deux places d'une page à l'autre : impossible de viser de mémoire.
- **Correctif** : garder les icônes toujours présentes à la même place (marquer simplement comme active celle que le panneau montre déjà) au lieu de les retirer.
- **Où** : `Sidebar.tsx:145-156` (`railIdsListedInPanel`), consommé `Sidebar.tsx:385`.

### Destinations principales seulement en icônes muettes (P1, M)

- **Vu** : Notes, Habitudes, Vues, Objectifs, Personnes, Aperçus, À revoir et Carrière ne sont atteignables dans la barre que par des icônes sans libellé (infobulle au survol seulement). À revoir (flèches circulaires) et Carrière (mallette) ne se devinent pas. Le panneau de 250 px à côté, lui, n'affiche que trois en-têtes repliés (Projets, Zones, Étiquettes) sur Aujourd'hui.
- **Correctif** : lister ces destinations en lignes libellées dans le panneau (sous Aujourd'hui et Planifier, comme Things), et garder le rail seul pour la barre repliée.
- **Où** : `Sidebar/SidebarRailMinimal.tsx:60-200` (liste `RAIL_ITEMS`), panneau `Sidebar/SidebarSmartLists.tsx`.

## Aujourd'hui (`/today`)

### « Rien de prévu » s'affiche pendant le chargement (P1, S)

- **Vu** : à l'ouverture, pendant une à deux secondes, « 0 à faire » et « Rien de prévu. Ajoutez une tâche ou prenez-en une dans les suggestions. » en gros, avant que les 9 tâches n'arrivent. Premier écran de la journée, il annonce une journée vide puis se remplit : effet de saut et fausse information.
- **Correctif** : tant que la liste du jour n'a pas répondu une première fois, afficher des lignes fantômes (ou rien) au lieu de l'état vide et du compteur.
- **Où** : `Today/DayList.tsx:533` (`!hasOpen && <EmptyState …>`), texte passé par `Today/TodayView.tsx:1337-1344`.

### L'état vide renvoie à des suggestions absentes (P2, S)

- **Vu** : « … ou prenez-en une dans les suggestions » alors qu'aucun bloc de suggestions n'est affiché (il n'apparaît que s'il y en a).
- **Correctif** : choisir le texte selon `dedupedSuggestions.length` (« Rien de prévu. Ajoutez une tâche. » sans suggestions).
- **Où** : `Today/TodayView.tsx:1321-1344`.

### La même heure répétée trois fois sur une ligne (P1, M)

- **Vu** : « Point design hebdomadaire » porte « 1 h → 10:30 », « ⚑ 09:30 » et « Prévue 09:30 » ; « Finaliser la grille » porte « 1 h 30 → 15:30 », « ⚑ 14:00 », « Prévue 14:00 ». Les lignes passent sur trois niveaux et la liste ne tient plus dans l'écran, alors que la grille à droite montre déjà le créneau. La puce ambre « Prévue 09:30 » signifie en fait « créneau manqué », ce qu'elle ne dit pas.
- **Correctif** : une seule puce horaire par ligne (« 09:30 – 10:30 », l'échéance seulement si elle diffère du créneau) ; renommer le créneau manqué « Manquée à 09:30 » (clé `today.missedAt`).
- **Où** : `Today/TaskLine.tsx:229` (puce manquée) et les puces de durée et d'échéance de la même ligne ; `public/locales/fr/translation.json:6558`.

### Bandeau « en retard » tronqué au mauvais endroit (P2, S)

- **Vu** : « Point design hebdomadaire ave… » puis « Décaler la suite » et « Plus tard » : la fin de la phrase (« a dépassé son créneau ») disparaît, le bandeau ne dit plus ce qui se passe.
- **Correctif** : mettre le motif d'abord (« Créneau dépassé : ») et laisser le titre se couper, ou passer les boutons sous le texte quand la colonne est étroite.
- **Où** : `Today/DayList.tsx:368-377`.

## Page projet (`/project/:uid`)

### Tableau : un sous-projet disparaît sans le dire (P1, S)

- **Vu** : « Refonte du site client » a 3 sous-projets ; l'onglet Tableau, vue par défaut « Tâches par projet », n'affiche que Refonte, Nouvelle page Tarifs et Page d'accueil. « Blog et actualités » (statut Prévu, 2 tâches ouvertes) est absent, sans mention. On croit ses tâches perdues.
- **Correctif** : sous la barre de vues, une ligne discrète « 1 sous-projet masqué (Prévu) · Afficher », ou inclure `planned` et `not_started` dans la vue par défaut.
- **Où** : `Project/Board/boardModel.ts:183-200` (`projectStatuses: ['in_progress']`, `hideEmptyColumns: true`), filtre `boardModel.ts:249-270`.

### Tableau : textes anglais et noms de vues codés en dur (P1, S)

- **Vu** : bouton « Add » dans le tiroir de sous-projet (signalé) et la colonne Captures, filtre « Filter (/ ) », statut « Archived » ; noms de vues par défaut codés en dur dans le modèle, en anglais (« Sections », « Status » pour un projet sans sous-projet) ou en français (« Tâches par projet », « Projets », qui resteront en français dans les 25 autres langues).
- **Correctif** : ajouter `common.add`, `common.filter`, `projects.status.archived` aux traductions ; donner aux vues par défaut une clé (`nameKey`) traduite à l'affichage, le nom libre restant pour les vues créées.
- **Où** : `Project/Board/SubProjectDrawer.tsx:255`, `Project/Board/BoardInboxColumn.tsx:103`, `Project/Board/ProjectControlBoard.tsx:279`, `:1266`, `:2027` ; `Project/Board/boardModel.ts:143`, `:163`, `:188`, `:207`.

### Deux recherches et deux barres d'outils superposées sur le Tableau (P2, M)

- **Vu** : sur l'onglet Tableau, une rangée « + Ajouter · loupe · liste » au niveau des onglets, puis une seconde rangée « Tâches par projet · Projets · + Vue … Captures · Filter · Affichage ». La loupe du haut et le champ « Filter » font la même chose.
- **Correctif** : sur le Tableau, masquer la loupe et l'icône de liste de la rangée des onglets (le Tableau a son filtre et son Affichage) ; garder « Ajouter ».
- **Où** : loupe `Project/ProjectDetails.tsx:1345-1368` (et le menu de liste qui suit), seconde rangée `Project/Board/ProjectControlBoard.tsx:1220-1290`.

### Panneau Infos : sélecteur « Fichier TODO.md » en tête de chaque projet (P2, S)

- **Vu** : premier champ du panneau Infos du projet, « Fichier TODO.md : Aucun » avec une liste déroulante, sur un projet qui n'a rien à voir avec un dépôt. Il passe avant Zone, Objectif et Échéance.
- **Correctif** : le placer en dernier, replié derrière « Ajouter un détail » quand aucun fichier n'est lié.
- **Où** : `Project/ProjectOverviewRail.tsx:360`.

### L'en-tête du projet mange la moitié de l'écran (P1, M)

- **Vu** : à 1440 x 900, fil d'Ariane, statut, titre, description, « Prochaine action », ligne de progression puis la liste des 3 sous-projets dépliée : les onglets arrivent à 460 px, la Chronologie ne montre que 6 lignes. À 1024 x 700 il reste moins d'un tiers de l'écran pour le contenu.
- **Correctif** : liste des sous-projets repliée par défaut sur tous les onglets (pas seulement Tableau), « Prochaine action » et progression sur une seule ligne grise sous le titre.
- **Où** : `Project/ProjectDetails.tsx:226-258` (règle d'ouverture par défaut), section `:1186-1230`.

## Listes de tâches (`/tasks`, projets, étiquettes)

### Toast de fin de tâche en anglais (P1, S)

- **Vu** : cocher une tâche dans Toutes les tâches affiche « Task 'Migrer les dix anciens billets' completed. » avec « Annuler » ; c'est le retour le plus fréquent de l'application. Aujourd'hui dit « « … » terminée » et Planifier « « … » faite » : trois formulations pour le même geste.
- **Correctif** : texte codé en dur à remplacer par une clé unique (`today.completed`, « « {{name}} » terminée ») utilisée aussi par `upcoming.completed`.
- **Où** : `Task/TaskRow/index.tsx:509-515` ; `Upcoming/UpcomingBoard.tsx:1203`.

### Toast de création verbeux (P2, S)

- **Vu** : « Tâche Audit essai créée avec succès ! » dans Toutes les tâches : le ton « avec succès ! » détonne avec les autres retours, courts et neutres.
- **Correctif** : « « Audit essai » ajoutée » avec lien d'ouverture, une seule clé pour tous les points d'ajout.
- **Où** : `Tasks.tsx:431-446`, clés `task.created` et `task.createdSuccessfully`.

### Priorité basse rendue en gris, comme une tâche inactive (P2, S)

- **Vu** : « Installer la nouvelle étagère », « Regarder : Typographie… », « Migrer les dix anciens billets » ont un titre gris clair ; rien n'explique que c'est la priorité basse. On lit « terminée » ou « désactivée ». La priorité est déjà dite par la case rouge (haute) et le drapeau.
- **Correctif** : garder le gris pour les tâches terminées ou reportées seulement ; priorité basse = titre normal.
- **Où** : `Task/TaskRow/TaskRowCollapsed.tsx:110-125` (`sheetTitleWeightClass`, cas `low`).

### Drapeau vide sur chaque ligne (P2, S)

- **Vu** : un petit drapeau gris après les puces de chaque ligne, y compris sans priorité : 12 drapeaux identiques à l'écran qui ne disent rien.
- **Correctif** : n'afficher le drapeau qu'au survol, au focus de la ligne, ou quand une priorité est posée (le raccourci P et le menu restent).
- **Où** : `Task/TaskRow/TaskRowCollapsed.tsx:475-481` (`MinimalPriorityEdit`).

### L'ajout rapide ne montre pas ce qu'il a compris (P2, M)

- **Vu** : en tapant « Audit essai demain !1 #rapide » dans « Ajouter une tâche », le texte reste brut jusqu'à Entrée ; la tâche est bien créée pour demain, priorité haute, étiquette rapide, mais rien ne l'annonce avant. La Capture (C) et la fiche ont le même champ.
- **Correctif** : sous le champ, les puces reconnues (« Demain · Haute · #rapide ») comme le fait la saisie de la Boîte quand un lien est collé ; les jetons reconnus en surbrillance dans le texte.
- **Où** : `Inbox/QuickCaptureInput.tsx` (champ partagé), utilisé par la ligne d'ajout des listes.

## Recherche (barre du haut, `/`)

### Filtres de date en casse mélangée et libellé « Dû » (P2, S)

- **Vu** : « Dû : AUJOURD'HUI · DEMAIN · la semaine prochaine · le mois prochain » : deux puces en capitales, deux en minuscules ; « Dû » n'est pas un libellé d'interface français.
- **Correctif** : clés propres au filtre (« Aujourd'hui », « Demain », « Semaine prochaine », « Mois prochain ») au lieu de réutiliser `dateIndicators.*` (écrites pour des badges en capitales) ; « Dû » devient « Échéance ».
- **Où** : `UniversalSearch/SearchMenu.tsx:63-73`, `:342` ; `public/locales/fr/translation.json` clés `search.dueFilter`, `dateIndicators.*`.

### Une tâche ouverte affichée avec une coche (P2, S)

- **Vu** : dans les résultats, chaque tâche ouverte porte un cercle coché bleu : elle semble déjà faite.
- **Correctif** : cercle vide comme sur les lignes (cercle coché seulement si la tâche est terminée).
- **Où** : `UniversalSearch/SearchResults.tsx:132`.

## Notes (`/notes`, éditeur)

### Panneau latéral vide sur la page Notes (P2, S)

- **Vu** : sur `/notes` et dans une note, le panneau de 250 px à côté du rail ne contient qu'un en-tête replié « NOTES 5 › » ; tout le reste est vide. Le panneau est fermé par défaut (`defaultExpanded = false`) et il est le seul contenu de la page de section.
- **Correctif** : quand le panneau est celui de la section Notes, le déplier toujours (l'arbre des notes est sa raison d'être), ou le masquer et rendre la largeur au contenu.
- **Où** : `Sidebar/SidebarNotes.tsx:29`, `hooks/useSidebarSectionExpanded.ts:19-25`, appel `Sidebar.tsx:207`.

### Nouvelle note : « New » en anglais et adresse inchangée (P2, S)

- **Vu** : la ligne d'information d'une note neuve affiche « New » ; l'adresse reste `/notes`, si bien que Retour quitte l'éditeur vers la page d'avant les notes et qu'un rechargement perd la note en cours.
- **Correctif** : clé traduite (« Nouvelle ») ; pousser une adresse dédiée (`/notes/new` puis `/notes/:uid` au premier enregistrement).
- **Où** : `Note/NoteEditorView.tsx:164-166` ; création depuis `Notes.tsx` (bouton « Nouvelle note »).

### La recherche garde sa requête après Échap et changement de page (P2, S)

- **Vu** : après une recherche « portugais » fermée par Échap puis un clic sur « Nouvelle note », la barre du haut affiche toujours « portugais » sur l'éditeur.
- **Correctif** : vider la requête à la fermeture par Échap et à chaque navigation.
- **Où** : `UniversalSearch/UniversalSearch.tsx` (état de la requête).

### Une ligne survolée passe par-dessus la fiche ouverte (P1, S)

- **Vu** : fiche ouverte à droite, passer la souris sur une autre ligne de la liste (« Brancher le bouton d'appel à l'action ») : la ligne et son fond s'étendent au-dessus de la fiche et cachent ses puces (« En vue · Cette semaine · Plus tard » disparaissent sous la ligne en sombre). Même chose pour la ligne qui a le focus.
- **Cause** : `hover:z-[10000] focus-within:z-[10000]` sur l'enveloppe de ligne (pour faire passer ses menus au-dessus des voisines), alors que la fiche est en `z-40`.
- **Correctif** : remonter seulement le menu ouvert (portail ou `z` sur le menu), ou limiter le `z` des lignes à 30, sous la fiche.
- **Où** : `Task/TaskList.tsx:91`, `Task/GroupedTaskList.tsx:110`, `:703`, `:735` (même motif dans `Kanban/KanbanBoard.tsx:405` et `Eisenhower/EisenhowerMatrix.tsx:535`) ; fiche `Task/TaskPane.tsx:331`.

### Fermer la fiche au clavier perd la position (P1, S)

- **Vu** : fiche ouverte depuis une ligne, Échap la ferme mais le focus retombe sur `body` : il faut recommencer la tabulation depuis le haut de la page (rail, panneau, mini-calendrier) pour revenir à la liste. Contraire au parcours clavier d'abord.
- **Correctif** : à la fermeture, rendre le focus à la ligne qui a ouvert la fiche (mémoriser `document.activeElement` à l'ouverture).
- **Où** : `Task/TaskPane.tsx` (fermeture), hôte `Task/TaskPanelHost.tsx`.

## Habitudes (`/habits`, `/habit/:uid`)

### Carte presque pleine mais « À faire » (P1, S)

- **Vu** : « Courir » (objectif à la semaine, 2 séances faites, objectif de séances non atteint) : la carte est remplie à 95 % de rouge vif, et dit « À faire ». La jauge dit « presque fini », le texte dit « rien fait » ; le rouge plein se lit comme une alerte.
- **Cause** : la part remplie vaut `progress_minor / target_minor` plafonnée à 0,95 (ici 2 / 1), sans tenir compte du nombre de séances demandées sur la période.
- **Correctif** : remplir selon ce qui valide la période (séances faites / séances demandées quand la fréquence porte sur plusieurs jours) et écrire « 2 sur 3 cette semaine » au lieu de « À faire ».
- **Où** : `utils/cadenceHabitUtils.ts:304-314` (`habitFillRatio`), `Habits/HabitCard.tsx:66-90` et `:175-200`.

### Page habitude : deux retours et des nombres bruts (P2, S)

- **Vu** : fil d'Ariane « Habitudes » puis, juste dessous, « ← Retour aux habitudes » ; statistiques « Total (30 jours) 49000 » sans séparateur ni unité, « Série : 4 périodes d'affilée » à côté de « Meilleure série : 4 ».
- **Correctif** : retirer le lien « Retour » (le fil suffit) ; nombres formatés selon la locale (`Intl.NumberFormat`, « 49 000 ») ; même unité pour série et meilleure série.
- **Où** : `Habits/HabitDetails.tsx:361` (lien retour), `:340-343` (total), `utils/cadenceHabitUtils.ts:133-143` (`formatMinor`).

### La liste des habitudes est affichée deux fois (P2, S)

- **Vu** : sur `/habits`, le panneau latéral répète les 5 habitudes (avec leurs cases) à côté des 5 cartes de la page.
- **Correctif** : sur la page Habitudes elle-même, replier le panneau ou le réduire au résumé ; il reste utile depuis les autres pages.
- **Où** : `Sidebar/SidebarHabitsPanel.tsx`, choix du panneau de section dans `Sidebar.tsx`.

## Calendrier (`/calendar`)

### Vue Mois : les tâches au-delà de 3 disparaissent sans « +N » visible (P1, S)

- **Vu** : la case du jeudi 26 montre 3 entrées alors que la journée en compte 9 ; aucune case de la vue Mois ne montre le « +N » prévu. Dans les semaines passées, les 3 places sont prises par les habitudes (« ✓ Boire 2 L d'eau », « Méditer », « Lire ») et les tâches de ces jours sont invisibles.
- **Cause** : le « +N » est rendu après les trois entrées dans un conteneur `overflow-hidden` dont la hauteur (rangées `auto-rows-fr`) ne laisse place qu'à trois lignes : il est coupé.
- **Correctif** : afficher deux entrées et « +N » quand il y a plus de trois éléments (ou le compteur dans l'en-tête de la case, à côté du numéro du jour) ; placer les tâches avant les habitudes dans l'ordre de la case.
- **Où** : `Calendar/CalendarMonthView.tsx:165-173` (`hiddenCount`), `:253-310` (rendu des trois entrées et du « +N »).

## Profil et réglages (`/profile`)

### « Nom » et « Prénom » inversés (P1, S)

- **Vu** : le champ « Nom » contient « Camille Martin » et le champ « Prénom » est vide avec « Entrez votre prénom ». Les clés `profile.name` (prénom ou nom complet) et `profile.surname` (nom de famille) sont traduites à l'envers.
- **Correctif** : `profile.name` = « Prénom », `profile.surname` = « Nom » (et les deux `enter*` correspondants).
- **Où** : `Profile/tabs/GeneralTab.tsx:138`, `:152` ; `public/locales/fr/translation.json`, clés `profile.name`, `profile.surname`, `profile.enterName`, `profile.enterSurname`.

## Largeur 1024 px

### La barre latérale garde 317 px sur un écran de 1024 (P1, S)

- **Vu** : à 1024 x 700, la barre (rail + panneau avec mini-calendrier) prend 31 % de la largeur. Sur Planifier, la colonne « Cette semaine » se tasse et les puces deviennent « R… », « #… » ; sur la page projet, l'onglet « Chronologie » est coupé (« Chronolog ») et le contenu commence à 490 px sur 700.
- **Correctif** : n'ouvrir la barre par défaut qu'à partir de 1280 px (rail seul en dessous), ou réduire le panneau à 240 px entre 1024 et 1280.
- **Où** : `Layout.tsx:76-77` et `:165` (`window.innerWidth >= 1024`) ; largeur `tailwind.config.js:158` (`--sidebar-width`).

### Onglets de projet coupés sans indice de défilement (P2, S)

- **Vu** : à 1024, la rangée « Tâches · Arborescence · Tableau · Calendrier · Chronolog » est coupée net ; rien n'indique qu'elle défile.
- **Correctif** : fondu sur le bord droit quand la rangée déborde, ou icônes seules sous 1100 px.
- **Où** : `Project/ProjectDetails.tsx:1248-1262` (`Segmented` des vues).

## Feuille de route (`/roadmap`)

### Libellés d'objectifs superposés (P1, S)

- **Vu** : dans la bande Objectifs, « Finaliser les maquettes… » (30 nov.) et « Livrer la v2 client da… » (31 déc.) s'écrivent l'un sur l'autre ; idem « Tenir 3 séances… » et « Courir le semi-mara… ». Illisible.
- **Cause** : le placement en couloirs suppose que chaque libellé part vers la droite ; les objectifs proches du bord droit sont retournés (`flip`, libellé vers la gauche) et recouvrent l'objectif précédent du même couloir.
- **Correctif** : pour un libellé retourné, tester le chevauchement avec son étendue à gauche (`left - GOAL_LABEL_SPAN`) avant de choisir le couloir.
- **Où** : `Roadmap/roadmapLayout.ts:117-148` (`placeGoals`) ; dates anglaises du même écran dans « Dates en anglais » ci-dessus.

### Titre hors du style commun (P2, S)

- **Vu** : « Feuille de route » en `text-xl` semi-gras, plus petit que tous les autres titres de page (800, via `PageHeader`).
- **Correctif** : utiliser `Shared/ui/PageHeader.tsx` comme les autres pages.
- **Où** : `Roadmap/Roadmap.tsx:10`.

## À trier (`/triage`)

### Dates ISO brutes (P2, S)

- **Vu** : « 2026-11-28 · Refonte du site client · #en-attente » sous le titre et bouton principal « Échéance : 2026-11-26 », alors que la phrase juste dessous dit « le 26 novembre ».
- **Correctif** : formater avec la locale (« jeu. 26 nov. ») au même endroit que le reste de l'application.
- **Où** : `Triage/TriagePage.tsx:301-303` (`triage.dueOn`), ligne de contexte `:414-426`.

### Trois boutons principaux sur un écran (P2, S)

- **Vu** : « Trier mes mails (4) » et « Décider (3) » en boutons pleins violets dans l'en-tête, plus « Échéance : … » plein dans la carte : l'œil ne sait pas où aller.
- **Correctif** : un seul bouton plein, celui de la carte ; les deux accès de l'en-tête en boutons neutres.
- **Où** : en-tête de `Triage/TriagePage.tsx` (actions `PageHeader`).

## Zones (`/area/:uid`)

### « 1 tâches sur 6 terminées » et la zone répétée sur chaque ligne (P2, S)

- **Vu** : ligne de progression « 1 tâches sur 6 terminées » (pas d'accord au singulier ; même clé sur projet, étiquette, objectif et vue) ; sur la page de la zone Apprendre, la ligne « Apprendre le portugais » répète « Apprendre » en sous-titre ; l'onglet « Projets 2 » n'en montre qu'un (l'autre est replié dans « Terminés (1) »).
- **Correctif** : clés au pluriel i18next (`progressSummary_one` / `_other`, compter sur `done`) ; ne pas afficher la zone sous un projet sur la page de cette zone ; compteur de l'onglet = projets ouverts.
- **Où** : `Area/AreaHero.tsx:73`, `Project/ProjectHero.tsx:649`, `Goal/GoalHero.tsx:208`, `ViewDetail.tsx:898` ; `public/locales/fr/translation.json:2083`, `:2744`, `:2896` ; ligne de projet de la page zone (sous-titre construit pour `/projects`).

## Clavier, palette et repères

### Palette : le nom de la tâche répété sous chaque commande (P2, S)

- **Vu** : Ctrl+K avec une tâche ouverte : la puce « Finaliser la grille des… » est déjà dans le champ, et chacune des 12 commandes répète « Tâche : Finaliser la grille des tarifs annuels » en sous-titre ; la liste double de hauteur.
- **Correctif** : pas de sous-titre quand le contexte est montré par la puce du champ.
- **Où** : `CommandPalette/paletteCommands.ts:155`.

### Pas de raccourci « aller à » pour Notes, Habitudes, Revue ; pas de lien d'évitement (P2, S)

- **Vu** : `g t`, `g i`, `g u`, `g c`, `g p` existent, mais rien pour Notes, Habitudes, À revoir, Zones ; au clavier, la première tabulation parcourt 10 icônes du rail, la poignée de redimensionnement et le mini-calendrier avant d'atteindre la page.
- **Correctif** : ajouter `g n`, `g h`, `g r`, `g a` dans le registre (l'aide `?` les liste d'office) ; un lien « Aller au contenu » visible au focus en tête de page.
- **Où** : `utils/shortcutRegistry.ts:59-97` ; mise en page `Layout.tsx`.

### Onglet du navigateur toujours « Cadence » (P2, S)

- **Vu** : le titre du document reste « Cadence » sur toutes les pages (vérifié sur 33 adresses) : historique, onglets et menu Retour indiscernables.
- **Correctif** : « Aujourd'hui · Cadence », « Refonte du site client · Cadence »… posé par `PageHeader` (un seul point) à partir du titre affiché.
- **Où** : `Shared/ui/PageHeader.tsx` (seul `Blog/BlogPostPage.tsx:43` le fait aujourd'hui).

## Hors de portée de cet audit

- Non vérifié en direct : glisser-déposer (Planifier, calendrier, Tableau), menus contextuels au clic droit, sélection multiple, onglet Arborescence en édition, réglages par rubrique au-delà de Général, notifications, états hors ligne et erreurs réseau réelles (seule la limite de débit a été vue : « Trop de requêtes, nouvel essai… » sur un écran « Chargement… »).
- Les pages Personnes, Étiquettes, Objectifs, Vues et À revoir ont été parcourues sans constat au-delà des points transverses.

## Les 15 changements les plus rentables

Ordre : impact sur l'usage quotidien divisé par l'effort. Les lots touchent des fichiers disjoints et peuvent être confiés l'un après l'autre à des exécutants différents ; chaque correctif de comportement arrive avec son test (`docs/testing.md`) et la page `wiki/` concernée.

**Lot A : langue et Tableau** (`public/locales/fr/translation.json`, `Task/TaskRow/index.tsx`, `Project/Board/*`, fichiers de dates)
1. Toast de fin de tâche traduit et unifié (« « … » terminée », aussi `upcoming.completed`) : `Task/TaskRow/index.tsx:509-515`, traductions. S.
2. Locale date-fns partout, `'en'` retiré du Tableau : `Project/Board/ProjectControlBoard.tsx:769`, `Project/ProjectOverviewRail.tsx:491,517,640`, `Roadmap/RoadmapChart.tsx:156,531`, `Goal/GoalHero.tsx:138`, `Everyone/EveryoneTimeline.tsx:309,310,389`, `Insights/FocusStats.tsx:174`. S.
3. Clés manquantes du Tableau (`common.add`, `common.filter`, `projects.status.archived`) et noms de vues par défaut traduits : `Project/Board/SubProjectDrawer.tsx:255`, `BoardInboxColumn.tsx:103`, `boardModel.ts:143-207`. S.
4. Sous-projet masqué signalé (ou statuts Prévu et Non commencé inclus par défaut) : `Project/Board/boardModel.ts:183-200`. S.
5. « Nom » et « Prénom » remis dans le bon sens : traductions `profile.*`. S.

**Lot B : listes et fiche de tâche** (`Task/TaskList.tsx`, `Task/GroupedTaskList.tsx`, `Task/TaskPane.tsx`, `Task/TaskPanelHost.tsx`, `Task/TaskEditorBody.tsx`)
6. Lignes survolées sous la fiche (z-index) : `Task/TaskList.tsx:91`, `Task/GroupedTaskList.tsx:110,703,735`. S.
7. Focus rendu à la ligne à la fermeture de la fiche : `Task/TaskPane.tsx`, `Task/TaskPanelHost.tsx`. S.
8. Titre de la fiche sur plusieurs lignes : `Task/TaskEditorBody.tsx:178-181`. S.

**Lot C : navigation** (`Sidebar.tsx`, `Layout.tsx`)
9. Rail d'icônes à ordre fixe : `Sidebar.tsx:145-156`. S.
10. Barre latérale repliée en rail sous 1280 px : `Layout.tsx:76-77,165`. S.

**Lot D : Aujourd'hui et Planifier** (`Today/DayList.tsx`, `Today/TodayView.tsx`, `Today/TaskLine.tsx`, `Shared/task/TaskCardBody.tsx`)
11. Pas d'état vide pendant le chargement, texte vide sans « suggestions » absentes : `Today/DayList.tsx:533`, `Today/TodayView.tsx:1321-1344`. S.
12. Une seule puce horaire par ligne, « Manquée à 09:30 » : `Today/TaskLine.tsx:229` et puces voisines. M.
13. Une seule puce (projet, sinon étiquette) sur les cartes de Planifier : `Shared/task/TaskCardBody.tsx:156-176`. S.

**Lot E : calendrier, habitudes, feuille de route** (`Calendar/CalendarMonthView.tsx`, `utils/cadenceHabitUtils.ts`, `Habits/HabitCard.tsx`, `Roadmap/roadmapLayout.ts`)
14. « +N » visible dans la vue Mois, tâches avant habitudes : `Calendar/CalendarMonthView.tsx:165-173,253-310`. S.
15. Remplissage et libellé honnêtes des cartes d'habitude (« 2 sur 3 cette semaine ») : `utils/cadenceHabitUtils.ts:304-314`, `Habits/HabitCard.tsx:66-90`. S. Le chevauchement des objectifs de la feuille de route (`Roadmap/roadmapLayout.ts:117-148`, S) peut rejoindre ce lot s'il reste du temps.
