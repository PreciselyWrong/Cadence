# Notes UX web → Android

Journal des décisions et corrections d'interface faites sur le web, pour que l'agent Android les reprenne. Une entrée par changement : ce qui n'allait pas, ce qui a été décidé, ce que l'app doit reprendre. Le comportement compte, pas le code React. Les jetons visuels (couleurs, rayons, typo) restent dans `DESIGN-TOKENS.md`.

## Cap

Interface directe, très claire, sans encombrement. Références de comportement : Things 3, TickTick, Todoist (jamais leur code, leurs ressources ni leurs textes).

- Une information n'apparaît qu'une fois par écran ; pas de métadonnée répétée sur chaque ligne si l'en-tête la porte déjà.
- Aucun bouton sans effet visible : un contrôle qui ne fait rien est retiré, pas laissé.
- Le contenu suit la largeur disponible ; jamais de défilement horizontal involontaire.

## Journal

### 2026-10-31 — Vue « À venir » (7 prochains jours)

- **Problème** : contenu centré dans une largeur maximale, ce qui laissait une bande vide à côté de la barre latérale ; colonnes de jours sur une seule ligne qui débordaient à droite.
- **Décision** : la vue occupe toute la largeur ; les jours forment une grille qui passe à la ligne (1 colonne étroit, 2 moyen, 4 large). Commit `2b15bb93`.
- **Android** : la liste des prochains jours ne défile jamais horizontalement ; sur tablette ou en paysage, les jours passent sur plusieurs colonnes au lieu de s'étirer.

### 2026-10-31 — « Aujourd'hui » sans « Show more »

- **Problème** : la liste « To do today » n'affichait que 5 tâches, le reste derrière « Show 5 more ».
- **Décision** : tout ce qui est prévu aujourd'hui s'affiche d'un coup (marqué #today, en retard, dû aujourd'hui, en cours, suggestions) ; le nombre de suggestions suit le réglage Planning, sans pagination.
- **Android** : l'écran Aujourd'hui ne tronque jamais la liste du jour derrière un bouton « voir plus ».

### 2026-10-31 — Menu « … » du rail invisible

- **Problème** : le bouton « … » du rail ouvrait son menu (vues masquées, réglage de la barre), mais le menu était rogné par le rail et caché sous le panneau : rien ne semblait se passer.
- **Décision** : un menu déroulant s'affiche toujours au-dessus de la page, à côté de son bouton, jamais dans un conteneur qui défile ou masque son contenu.
- **Android** : un menu ou une feuille ouverts depuis la navigation passent au premier plan ; tout bouton doit produire un effet visible.

### 2026-10-31 — Tags imbriqués (namespaces façon Logseq)

- **Demande** : des tags imbriqués comme les namespaces Logseq, à profondeur libre.
- **Décisions** (contrat serveur dans `docs/09-tags-system.md`) :
  - le nom d'un tag est son chemin complet : `perso/sport/course` ; deux `sport` peuvent coexister sous des parents différents ;
  - saisir `perso/sport` n'importe où (tâche, note, projet, panneau de tag) crée les ancêtres manquants ;
  - renommer un tag renomme tout son sous-arbre ; un conflit de nom refuse l'opération (409) ;
  - un tag ne peut pas aller sous lui-même ni sous un de ses descendants ;
  - filtrer par un tag parent inclut tous ses descendants, à toute profondeur ;
  - supprimer un parent remonte ses enfants d'un niveau ;
  - affichage : dans un arbre (barre latérale, page Tags), le nom court sous son parent, le chemin complet en infobulle ; ailleurs (puces de tâche, sélecteurs), le chemin complet ;
  - le panneau d'un tag édite le nom court et le parent (liste de tous les tags sauf lui et ses descendants, par chemin complet) et enregistre le chemin.
- **Android** :
  - afficher les tags en arbre dans les écrans de navigation et de filtre, avec le nom court sous le parent ; puces avec le chemin complet ;
  - accepter `/` dans la saisie d'un tag ; le serveur crée les ancêtres à la synchro ;
  - la migration serveur a renommé les tags imbriqués existants (`sport` → `perso/sport`) sans entrée de journal : la version qui adopte les namespaces doit retélécharger le snapshot des tags (`GET /api/v1/sync/snapshot?entity=tag`) une fois.

### 2026-10-31 — Icônes des projets et des tags

- **Demande** : projets et tags portent une petite icône, visible partout où ils apparaissent.
- **Décisions** :
  - jeu d'icônes partagé, mêmes identifiants que `android/app/src/main/java/ch/nicolab/cadence/ui/icon/HabitIconRegistry.kt` (60 icônes Material, mêmes libellés FR/EN et mots-clés) ; le web en garde une copie générée (`frontend/constants/entityIcons.ts`, régénérée par `scripts/gen-entity-icons.py`) ;
  - le serveur stocke seulement l'identifiant (`icon`, kebab-case, 40 caractères max, sinon 400 ou `invalid_icon` en synchro) ; un identifiant inconnu s'affiche avec l'icône par défaut ;
  - aucune icône imposée : sans choix, le projet garde son dossier et le tag rien de plus (barre latérale épurée) ;
  - choix dans le panneau du projet et du tag : grille avec recherche (libellé ou mot-clé, accents ignorés) et « Aucune icône » ;
  - affichée dans la barre latérale (projets, tags), l'en-tête et la carte du projet, la puce projet du panneau de tâche, les lignes de tâche (projet et tags, modes Minimal et Dense) et la page Tags.
- **Android** : lire et écrire le champ `icon` des projets et des tags (il arrive déjà par la synchro, ignoré pour l'instant) ; l'afficher avec `HabitIconRegistry` aux mêmes endroits ; ajouter une icône au registre l'ajoute aux deux clients (relancer le script web).

### 2026-10-31 — Sous-projets lisibles

- **Problème** : sur un sous-projet, rien n'indiquait son parent (fil d'Ariane « Projects › Cuisine ») ; sur le parent, les sous-projets n'étaient qu'une petite puce peu visible.
- **Décisions** :
  - fil d'Ariane complet : Projects (ou la zone du projet racine) › chaque parent, racine d'abord › le sous-projet ; chaque parent est un lien ;
  - sur le parent, une liste « Sous-projets » au-dessus des tâches : une ligne par sous-projet direct, avec son icône, son nom, le nombre de tâches ouvertes et un chevron, comme un dossier ;
  - les tâches des sous-projets restent dans leur projet, pas fusionnées dans le parent.
- **Android** : l'écran d'un projet affiche ses sous-projets en lignes (icône, nom, tâches ouvertes) au-dessus des tâches ; l'en-tête d'un sous-projet montre le chemin des parents, chacun cliquable.

### 2026-10-31 — Glisser-déposer vers la barre latérale

- **Problème** : seule une ligne de tâche d'une liste Minimale triable pouvait être lâchée, et seulement sur un projet ; À venir, les cartes du jour, les notes et les projets ne se glissaient nulle part, et le mode Dense n'acceptait rien.
- **Décisions** (règles complètes dans `docs/32-sidebar.md`, « Drop on the sidebar ») :
  - cibles : projet (section Projets et projets d'un dossier de zone), tag, zone, Aujourd'hui et Demain (listes intelligentes en Minimal, lien Aujourd'hui en Dense) ;
  - effets : tâche ou note sur un projet → déplacée dedans ; tâche ou note sur un tag → reçoit le tag (chemin complet), ses autres tags restent ; tâche sur une zone → prend la zone ; projet sur une zone → rangé dans la zone ; tâche sur Aujourd'hui / Demain → échéance ce jour-là ;
  - refus : une note n'a pas de zone ni d'échéance ; une tâche récurrente ne va pas sur Aujourd'hui / Demain (une date d'une série passe par le déplacement d'occurrence) ; un sous-projet ne change pas de zone (il suit son parent) ; une tâche issue d'un `TODO.md` ne se glisse pas ; une cible qui refuse ne s'allume pas ;
  - doublon : déjà dans ce projet ou cette zone, tag déjà présent, déjà dû ce jour-là → rien n'est enregistré ;
  - sources : lignes de tâche de toutes les listes (Tâches, À venir, pages projet, zone, tag, Aujourd'hui, cartes candidates du jour), cartes de note (page Notes, page projet) et notes de la barre, projets de la barre et cartes de la page Projets ; le tri par glisser existant reste, le dépôt sur la barre l'emporte ;
  - retour : la cible sous le pointeur s'entoure d'un anneau bleu ; la ligne garde sa place et affiche le changement sans rechargement ; un échec affiche un toast d'erreur ; pas de toast de succès ni d'annulation (aucun motif d'annulation pour un déplacement n'existe encore) ; le clic qui termine le glisser n'ouvre pas la cible ;
  - densités : identique en Minimal et en Dense ; le glisser au clavier réordonne toujours, sans jamais viser la barre.
- **Android** : reprendre le geste par appui long puis glisser vers les cibles du tiroir ou de la navigation (projets, tags, zones, Aujourd'hui / Demain) quand l'écran les montre pendant le glisser (tiroir ouvert, tablette, paysage) ; mêmes effets, mêmes refus, rien d'enregistré en cas de doublon, cible surlignée pendant le survol, la ligne reste à sa place.

### 2026-10-31 — Ton sans culpabilité, revue et récurrence

- **Problème** : « 3 jours de retard », « reportée N fois » et « cette tâche n'a pas été complétée » culpabilisent ; une tâche sans date apparaissait « En retard » parce que son projet l'était.
- **Décisions** (règles dans `docs/34-review.md` et `docs/02-today-page-sections.md`) :
  - plus aucun compteur de jours de retard : les cartes en retard du planificateur et l'en-tête de projet disent « Échéance 20 sept. » (`dailyPlan.dueSince`, `project.dueOn`) ; l'alerte du panneau de tâche dit seulement que la tâche était dans le plan d'hier et propose de la replanifier ou de la découper ;
  - « Déplacée N fois » (`review.movedCount`, `postponements.summary`) dans la revue et dans l'historique du panneau seulement, jamais sur une ligne de tâche normale ;
  - une tâche sans échéance n'est jamais « En retard » à cause de son projet (elle reste dans les listes et suggestions ordinaires) ; une échéance de projet « aujourd'hui » classe toujours ses tâches sans date dans « Aujourd'hui » ;
  - reporter une occurrence récurrente (`move-occurrence`) et une échéance reçue depuis un appareil par la synchro (source `device`) comptent comme des reports volontaires dans la revue ;
  - la rangée de décision (En vue / Cette semaine / Plus tard) et la ligne d'historique des reports sont aussi sur la page complète d'une tâche (`/task/:uid`), donc en Dense.
- **Android** : retirer tout libellé « en retard de N jours » (afficher la date d'échéance), employer « déplacée N fois » dans l'historique des reports, ne jamais marquer en retard une tâche sans échéance ; reprendre la rangée de décision dans le détail de tâche.

### 2026-11-01 — Prochaine action, revue du vendredi, cinq domaines, objectifs

- **Problème** : un projet ne disait jamais « quoi faire ensuite » (Aujourd'hui en proposait plusieurs), la revue hebdomadaire reposait sur la mémoire, une zone vide demandait de tout inventer, et les objectifs ne se mesuraient pas (pas de résultats clés, pas de liste d'envies sans date).
- **Décisions** (règles dans `docs/06-projects.md`, `docs/34-review.md`, `docs/07-areas.md`, `docs/12-goals-system.md`) :
  - prochaine action d'un projet (`next_task_uid`) : choisie dans le menu d'une ligne de tâche de la page projet (case « Action suivante »), affichée en ligne discrète sur l'en-tête et les cartes de projet (sinon l'en-tête retombe sur la suggestion automatique), seule suggérée par Aujourd'hui pour ce projet, effacée seule quand la tâche est terminée, supprimée ou déplacée ;
  - revue du vendredi : un lien discret « Planifier une revue hebdo le vendredi » dans la revue tant qu'aucune tâche hebdomadaire ne renvoie vers `/review` ; il crée une tâche récurrente du vendredi sans rappel ni notification, puis disparaît ;
  - « Suggérer 5 domaines » (Business et Argent, Tech et Systèmes, Perso, Famille et Social, Logistique) : bouton de l'état vide des zones, lien discret en tête de liste ensuite ; ignore les noms déjà présents, jamais automatique ;
  - résultats clés : un objectif liste ses résultats clés (un niveau) avec une progression « N sur M faits » (tâches et projets liés terminés) ; champ « Ajouter un résultat clé » discret, seulement sur un objectif ; les sélecteurs d'objectif affichent « Objectif › Résultat clé » ; la liste des objectifs et la barre latérale n'affichent que les objectifs ;
  - horizons « Mois » et « Trimestre » en plus de Saison et Année ;
  - liste d'envies : onglet « Liste d'envies » de la page Objectifs, groupes Avoir / Être / Faire avec « + Ajouter » par groupe, ni date ni horizon, jamais dans Aujourd'hui ni dans la barre latérale.
- **Android** : lire `projects.next_task_uid` et `goals` par la synchro (entité `goal`, champs `title`, `why`, `horizon`, `target_date`, `status`, `color`, `bucket`, références `area_uid` et `parent_goal_uid` ; `goal_uid` sur tâches et projets ; schéma 3). À faire : action « Action suivante » dans le menu d'une tâche de projet (écrit `next_task_uid`, à effacer si la tâche est close) et ligne « Action suivante » sur l'en-tête et la carte du projet ; lien « Planifier une revue hebdo le vendredi » dans la revue (`POST /api/review/weekly-routine`, même règle d'existence) ; « Suggérer 5 domaines » sur l'écran des zones (noms localisés, sans doublon) ; écran Objectifs avec résultats clés sous l'objectif (progression calculée localement) et onglet Liste d'envies (Avoir / Être / Faire) ; horizons Mois et Trimestre. Entrée à inscrire dans `TODO.md` (`Now`) par l'agent Android.

### 2026-11-01 — Notifications : une seule voix, heures calmes, rappel

- **Problème** : « en retard » revenait par notification et par Telegram ; la même alerte sonnait partout ; aucun rappel réglable côté web ; rien pour la nuit.
- **Décisions** (règles dans `docs/36-notifications.md`) :
  - plus aucune notification ni message Telegram « en retard » (les clés `overdueTasks` et `overdueProjects` restent stockées mais leurs lignes sont masquées) ; « bientôt dû » part une fois par échéance et se met à jour sur place ; les résumés disent « Encore ouvert » avec la date ;
  - réglages : colonne **Ordinateur** par type (désactivée par défaut pour les rappels de tâche, car le téléphone sonne ; activée pour « bientôt dû » et « tâche active »), ligne « Rappels de tâche », plus de colonne e-mail ni de ligne « Rappels d'habitudes » ;
  - **Heures calmes** (`quiet_hours` sur le profil, `{enabled, start, end}`, fuseau du profil) : le fil in-app reçoit tout de suite, push, Telegram, Apprise et ordinateur attendent la fin de la plage ;
  - champ **Rappel** : puce « Rappel » du panneau de tâche derrière « Plus » (visible dès qu'un rappel existe), carte « Rappel » sur la page de tâche ; une tâche récurrente décale son rappel avec l'échéance.
- **Android** : lire `quiet_hours` (profil) pour ne pas sonner dans la plage ; garder les rappels de tâche locaux (le téléphone en est propriétaire) ; recevoir `reminder_at` et `reminder_sent_at` par la synchro ; retirer toute alerte « en retard » et dire « Encore ouvert » avec la date.


### 2026-11-01 — Revue UX web : simplicité, débordements, français

- **Problème** (revue complète à 375 et 1440 px, clair et sombre) : sur téléphone, chaque carte d'Aujourd'hui affichait ses durées (15 min, 30 min, 1 h, 2 h) et « Demain / Semaine prochaine / Abandonner », soit des dizaines de boutons ; le panneau d'une tâche simple montrait 12 puces vides et une grande zone d'envoi de fichiers ; le mois du calendrier s'écrasait sur une ligne sous la liste du jour ; la page projet débordait à droite ; la semaine s'ouvrait sur minuit ; la Boîte de réception cachait ses éléments ; les cartes de projet disaient « Pas de date d'échéance » et « En retard de N jours » ; une priorité haute venue de l'API n'apparaissait pas dans le panneau ; textes anglais en français (Apprise, notifications, pièces jointes, tri des zones et objectifs, libellés d'accessibilité) et « Tâches échues » pour des tâches bientôt dues.
- **Décisions** :
  - une tâche simple reste simple : le panneau montre échéance, projet et étiquettes, plus tout champ déjà rempli (zone, priorité, statut autre que « non commencé », récurrence, estimation, report, rappel, assignation) ; le reste attend derrière « Plus » ; la priorité 0 (valeur par défaut) compte comme aucune priorité ;
  - pièces jointes : la zone d'envoi n'apparaît qu'une fois un fichier joint ou après « Joindre des fichiers » ; le panneau ne répète plus « Sous-tâches » sous son titre de section ;
  - Aujourd'hui sur écran tactile : durées et actions de report s'ouvrent carte par carte avec un chevron ; sur ordinateur, survol ou focus clavier comme avant ; cibles tactiles de 44 px (ajout au plan, chevron, cloche des notifications) ;
  - calendrier mois sur téléphone : la grille garde sa hauteur, la liste du jour défile dessous ; semaine et 3 jours s'ouvrent sur l'heure du premier élément horaire de la période, sinon 7 h ;
  - page projet : les onglets de vue défilent dans leur rangée, les actions ne poussent plus la page ; le bouton Aperçus IA n'apparaît que si l'assistant IA est activé ; Projets : les outils passent sous le titre sur téléphone ;
  - cartes et liste de projets : rien quand il n'y a pas d'échéance ; une échéance passée s'affiche « Échéance 20 sept. », sans rouge ni compte de jours ;
  - Boîte de réception : la liste « Récemment capturé » est ouverte par défaut (le choix replié reste mémorisé) ;
  - lignes de tâche Minimal : les puces de droite se tassent sur une ligne étroite (rognées à gauche, l'heure reste lisible), jamais de défilement horizontal ;
  - textes : 129 chaînes manquantes ajoutées dans les 26 langues (les textes des pièces jointes passent sous `attachments.*`, car `task.attachments` est déjà un libellé) ; « Tâches bientôt dues », « Projets bientôt dus », « Ouvrir la boîte de réception » ; interrupteurs de notifications annoncés « Canal · Type » (rôle switch).
- **Android à reprendre** :
  - détail de tâche : mêmes champs toujours visibles (échéance, projet, étiquettes) et mêmes règles « rempli = visible, sinon derrière Plus » ; priorité 0 = aucune ;
  - pas de zone de pièces jointes vide : une action « Joindre des fichiers » suffit ;
  - Aujourd'hui : les durées et le report d'une carte s'ouvrent sur demande (chevron ou appui long), jamais sur toutes les cartes ;
  - agenda semaine : ouvrir sur le premier élément horaire de la semaine, sinon 7 h ;
  - cartes de projet : aucune mention d'échéance absente, échéance passée en date neutre ;
  - Boîte : la liste des éléments capturés est visible à l'ouverture ;
  - libellés : « Tâches bientôt dues » pour les notifications d'échéance proche.
