# Notes UX web → Android

Journal des décisions et corrections d'interface faites sur le web, pour que l'agent Android les reprenne. Une entrée par changement : ce qui n'allait pas, ce qui a été décidé, ce que l'app doit reprendre. Le comportement compte, pas le code React. Les jetons visuels (couleurs, rayons, typo) restent dans `DESIGN-TOKENS.md`.

## Cap

Interface directe, très claire, sans encombrement. Références de comportement : Things 3, TickTick, Todoist (jamais leur code, leurs ressources ni leurs textes).

- Une information n'apparaît qu'une fois par écran ; pas de métadonnée répétée sur chaque ligne si l'en-tête la porte déjà.
- Aucun bouton sans effet visible : un contrôle qui ne fait rien est retiré, pas laissé.
- Le contenu suit la largeur disponible ; jamais de défilement horizontal involontaire.

## Journal

### 2026-11-01 — Liste d'envies : « Créer une tâche »

- **Problème** : une envie (Avoir / Être / Faire) restait un rêve sans prochain pas ; aucun geste ne la reliait à une tâche, et rien ne disait si un pas existait déjà.
- **Décision** : le menu « … » d'une envie (onglet Liste d'envies de la page Objectifs) porte « Créer une tâche » : la capture s'ouvre sur Tâche, préremplie du nom, avec la ligne « Prochain pas pour … » ; la tâche enregistrée est liée à l'envie (`goal_id`), projet au choix par `+projet`. L'envie reste et affiche « Tâches liées : N » à toutes les largeurs. L'édition d'une envie passe par sa page (bouton Modifier, `GoalModal`).
- **Android** : repris dans la même étape (fiche d'une envie, « Créer une tâche », compte des tâches liées).

### 2026-11-01 — Suggestions en direct et saisie en série

- **Problème** : taper `#` ou `+` seul n'ouvrait rien (il fallait déjà une lettre), `!` et `~` ne proposaient rien, les étiquettes imbriquées (`perso/sport`) n'étaient ni proposées ni relues par le serveur, et chaque tâche ajoutée repartait sans le projet de la précédente.
- **Décision** : `#`, `+`, `~` et `!` en début de mot ouvrent leur liste tout de suite, sous le curseur : étiquettes (plus utilisées d'abord, chemin complet, point de couleur, « Créer #nom » en dernier), projets ouverts, domaines, priorités `!1` Haute / `!2` Moyenne / `!3` Basse. Flèches, Entrée ou Tab choisissent, Échap ferme ; `!` ne présélectionne rien (Entrée continue d'enregistrer). Aucun appel réseau : les listes viennent du store. La phrase de date reconnue est surlignée dans le champ. Après un enregistrement la boîte reste ouverte et le projet reste en pastille retirable, avec le compteur « Ajoutées à Projet : 3 » et « Annuler » ; étiquettes, priorité et date ne suivent pas ; fin de série à la réouverture, au retrait de la pastille ou après 2 minutes sans activité.
- **Android** : même grammaire (`#` `+` `^` `!`), liste compacte sous le champ au-dessus du clavier, date surlignée, saisie en série avec « Terminé ». Écarts : pas de `~` (une tâche Android n'a pas de domaine propre) ni de « Créer #nom » (l'app ne crée pas d'étiquette).

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


### 2026-11-01 — Restes du web : recherche d'objectifs, calendrier des habitudes, réglages

- **Problème** : Ctrl+K ne trouvait pas les objectifs ; « Afficher les habitudes » du calendrier ne faisait plus rien depuis le retrait de l'ancien module ; la carte Apprise imbriquait un `<form>` dans celui du profil (avertissement React) ; le tableau Réglages › Notifications débordait à 375 px avec des interrupteurs de 20 px ; 150 textes utilisés dans le code n'existaient dans aucun fichier de langue (l'anglais par défaut s'affichait partout, y compris en français).
- **Décisions** :
  - Ctrl+K : les objectifs apparaissent sous « Objectifs » (titre ou « pourquoi » ; les siens seulement) et ouvrent la page de l'objectif ; l'API de recherche prend `filters=Goal`, absent par défaut ;
  - calendrier : chaque habitude due s'affiche en puce « journée entière » à sa couleur, ou en bloc de 30 minutes à l'heure de son premier rappel actif ce jour-là ; « ✓ » devant le nom quand le jour est fait ; jours en pause omis ; une habitude « N fois par semaine » ou un suivi libre n'apparaît que les jours où elle a été faite ; un clic ouvre l'habitude ; lecture seule ;
  - Apprise : plus de `<form>` (Entrée dans un champ enregistre, le bouton Enregistrer aussi), comme Webhooks ;
  - Réglages › Notifications sur téléphone : une carte par type, une ligne par canal avec son libellé et l'interrupteur (zone d'appui 44 px) ; le tableau reste à partir de `md` ; les boutons « Tester » font 44 px de haut sur téléphone ;
  - capture : `POST /api/inbox` accepte `Idempotency-Key`, une capture rejouée ne crée pas de doublon.
- **Android à reprendre** :
  - calendrier ou agenda : afficher les jours dus des habitudes avec la même règle (pas de pause, pas de jour « N fois par semaine » non fait, heure du premier rappel du jour) ;
  - recherche : inclure les objectifs ;
  - capture hors ligne : envoyer un `Idempotency-Key` stable par élément en file pour `POST /api/inbox` ;
  - réglages de notifications : une ligne par canal avec cible tactile d'au moins 44 dp.

### 2026-11-01 — Tâche récurrente : modifier celle-ci ou la série

- **Problème** : seul le déplacement d'une date demandait jusqu'où aller ; renommer, changer l'heure, la durée, la note, la priorité, le projet, les tags ou le rappel d'une tâche récurrente modifiait toute la série sans prévenir, et supprimer supprimait toute la série.
- **Décision** : toute modification d'une tâche récurrente demande une fois par enregistrement (sortie du champ, choix dans un menu, glisser ou étirer dans le calendrier, jamais à chaque frappe) « Modifier cette tâche ou la série ? » : Seulement celle-ci (le jour devient une tâche à part, la série saute ce jour), Celle-ci et les suivantes (la série s'arrête la veille, une nouvelle série repart de ce jour avec le changement), Toutes. Annuler n'enregistre rien. Changer la règle de répétition, cocher ou décocher, épingler ou mettre dans Aujourd'hui ne demande rien. Supprimer demande « Supprimer cette tâche ou la série ? » à la place de la confirmation habituelle (celle-ci = sauter l'occurrence). Une occurrence future ouverte depuis le calendrier s'ouvre sur son propre jour, et son bloc se redimensionne comme celui de l'occurrence courante. Après « Seulement celle-ci », le panneau affiche la tâche détachée.
- **Android** : même question, mêmes trois choix, au même moment (à l'enregistrement d'une feuille ou d'un champ, au glisser dans l'agenda), sur toutes les surfaces d'édition et à la suppression ; contrat (endpoint `edit-occurrence` / `delete-occurrence` ou ops de synchro hors ligne) dans `docs/01-recurring-tasks-behavior.md`, section « API and offline clients ».

### 2026-11-01 — Ressenti : réponse immédiate, calme, mêmes mots qu'Android

- **Problème** (QA adversariale, 375 et 1440 px, clair et sombre, données extrêmes) : cocher une tâche d'Aujourd'hui, décider dans la revue ou cocher une habitude attendait le serveur avant de bouger (et la ligne d'Aujourd'hui disparaissait d'un coup, sans se replier) ; un double clic créait deux habitudes ou deux éléments de la boîte ; la jauge du jour passait au rouge, les échéances passées d'Aujourd'hui portaient un point rouge, l'aperçu IA d'un projet disait « En retard de N j » ; le toast de réussite était vert vif, son bouton « Undo » en anglais, sans libellé pour fermer ; des étiquettes longues écrasaient le nom des tâches d'Aujourd'hui ; les menus « … » des objectifs, étiquettes, zones, vues et les « + » de la barre latérale n'apparaissaient qu'au survol (invisibles au doigt et au clavier) ; mots différents d'Android (« En sommeil », « Action suivante », « Liste de souhaits », « Écarter »).
- **Décisions** :
  - optimiste partout où l'on décide : la ligne cochée d'Aujourd'hui se replie avec la coche (comme les autres listes) puis quitte la liste sans attendre le serveur ; la ligne décidée dans la revue part tout de suite ; la carte d'habitude montre l'entrée tout de suite ; un échec remet la ligne ou la carte à sa place et le dit ;
  - un panneau latéral (habitude, projet, objectif, zone, étiquette…) et la capture n'enregistrent qu'une fois tant qu'un enregistrement est en cours ;
  - plus de rouge pour un jour trop rempli ni pour une échéance passée : ambre pour la jauge, point gris, et « Échéance 5 mars » au lieu d'un compte de jours ;
  - toast de réussite neutre (sombre en clair, clair en sombre), trois lignes au plus, annoncé aux lecteurs d'écran, « Annuler » et « Fermer » traduits ; l'erreur garde le rouge ;
  - actions de ligne : visibles en permanence sur écran tactile, au survol ou au focus clavier ailleurs ; chaque bouton icône a un nom ;
  - termes FR : revue « Plus tard » (onglet), « Mettre de côté », « Laisser de côté », « Créer une tâche », « Supprimer », « Garder tel quel », « Retirer de la vue » ; « Prochaine action » ; « Liste d'envies ».
- **Android à reprendre** : vérifier que cocher une tâche, décider dans la revue et cocher une habitude changent l'écran avant la réponse du serveur (rien n'attend le réseau, un échec revient en arrière avec un message) ; jauge du jour trop rempli en ambre, jamais en rouge ; aucune action de ligne cachée derrière un appui long sans alternative visible.

### 2026-11-01 — Étiquettes colorées

- **Problème** : presque toutes les étiquettes (importées de TickTick) n'avaient pas de couleur et s'affichaient en gris partout.
- **Décision** : une étiquette a toujours une couleur. Ordre : la sienne, sinon celle du plus proche ancêtre qui en a une (`perso` pour `perso/sport`), sinon une teinte de la palette tirée du premier segment de son nom (hachage `h*31+c`, hors gris), donc stable. Palette, hachage et cas dans `fixtures/tags/colors.json`, rejoués par `frontend/utils/__tests__/tagColor.test.ts` et `TagColorsTest` (Android). Rendu calme : pastille teintée à 12 % (texte mélangé au noir/blanc pour garder AA) pour les puces (lignes de tâche, calendrier, fiche mobile), point coloré dans l'arbre de la barre latérale, bord/teinte pour la ligne et l'en-tête de page d'étiquette, point dans la saisie d'étiquettes. Sélecteur du panneau d'étiquette : chaque teinte en trois nuances (clair, moyen, foncé), saisie hex libre, « Automatique ».
- **Android à reprendre / repris** : même palette et même hachage (`TagColors`), même ordre ; choix de couleur dans le crayon de l'étiquette (op `color` de l'étiquette, comme l'icône) ; badges de la fiche et des notes, puces de saisie rapide, arbre de l'onglet Étiquettes et widget « Aujourd'hui » (point coloré devant `#nom`, clair/sombre). Le widget Tâches n'affiche pas d'étiquettes.

### 2026-11-01 — Liens : un endroit pour tous les liens

- **Problème** : beaucoup de liens capturés (dépôts, articles, outils) ; l'Inbox ne montrait que l'image et le texte, sans dire ce qu'est la page ni pourquoi on l'a gardée, et rien ne les réunissait.
- **Décisions** :
  - chaque lien d'une idée, d'une tâche ou d'une note devient un lien enregistré (`docs/37-links.md`) ; le serveur lit la page en arrière-plan (titre, description, image, site, type), et pour un dépôt GitHub les étoiles, le langage, la dernière mise à jour et le début du README ; la capture n'attend jamais ;
  - le texte tapé à côté du lien à la capture devient sa note ; dans l'Inbox, la carte du lien montre titre, une ligne de description, domaine, type, et la note dessous (clic pour écrire, Entrée enregistre) ; le texte de l'idée n'est plus répété quand il est devenu la note ;
  - page « Liens » (`/links`, barre latérale dense après l'Inbox, rail minimal dans « Plus », Ctrl+K) : recherche, filtres type, statut (par défaut : sauf jetés), étiquette, site, tri par date ; cartes en grille 1/2/3 colonnes (titre, deux lignes de description, domaine, badge de type, chiffres GitHub, début du README, note, étiquettes) ; actions Tester, Garder, Plus tard, Jeter (un second clic revient à Nouveau), étiquettes, ouvrir, aller à la source ;
  - aucune IA dans la chaîne ; un assistant pourra proposer étiquettes et notes par MCP (`list_links untagged`, `update_link`).
- **Android à reprendre / repris** : écran Liens depuis l'en-tête de l'Inbox (recherche, puces de type et « Jetés », mêmes cartes, note dans une petite fenêtre, statut en puces), lecture hors ligne (Room `links`, v9) et écritures de note et statut par la file d'envoi ; idées de l'Inbox avec le résumé du lien et sa note. Reste : étiquettes d'un lien et « aller à la source » (web seulement, inscrit dans `TODO.md`).

### 2026-11-01 — Trier un lien de l'Inbox sur le web

- **Problème** : une idée qui contient un lien offrait Aujourd'hui / Planifier / Projet, mais aucune décision « à voir un jour » ; sur Android, « Plus tard » gardait sa date seulement sur le téléphone, le web ne pouvait pas l'afficher.
- **Décision** : la carte d'un lien dans l'Inbox porte quatre boutons Garder, Tester, Plus tard, Jeter (mêmes statuts, même marquage « traité »). Tester demande le projet (ou aucun) puis crée « Tester : titre », l'adresse et la note en note de tâche. Plus tard pose la date de revue (`review_at`, +30 jours) côté serveur ; la page Liens l'affiche (« À revoir le … »). Pas d'annulation : il n'existe pas de retour d'une idée traitée. Le mode « Trier les liens » (un lien à la fois) reste à faire (TODO).
- **Android** : la date de revue est désormais le champ synchronisé `review_at`, plus une valeur locale.

### 2026-11-01 — Lieu d'un événement : carte ou copie

- **Problème** : le lieu d'un événement de l'agenda ne servait à rien d'un geste : une adresse n'ouvrait ni carte ni copie, un lien de réunion restait du texte.
- **Décision** : dans la fiche d'un événement (web : modale Google), le lieu est un lien et un bouton copier. Une adresse ouvre `https://www.google.com/maps/search/?api=1&query=…` dans un nouvel onglet ; un lien web (`http(s)://`, seul dans le champ) s'ouvre tel quel. Le bouton copie l'adresse et confirme par une notification. Pure logique dans `frontend/components/Calendar/eventLocation.ts`.
- **Android** : fiche d'événement, ligne « Lieu » touchable avec une épingle. Adresse : menu « Ouvrir dans Maps » (intention `geo:0,0?q=…`, repli sur la recherche Maps dans le navigateur) et « Copier l'adresse » (presse-papiers et confirmation). Lien web : navigateur direct. Pure logique dans `android/calendar/.../EventLocation.kt`. Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — UI épurée : rail, encombrement, débordements

Revue écran par écran (Aujourd'hui, Boîte, Tâches, Projets, page projet, Agenda, Habitudes, Revue, Liens, Notes, Réglages) à 375, 768, 1280 et 1920 px, données longues. Le menu « … » du rail et ses icônes fonctionnaient tous ; les problèmes étaient ailleurs.

- **Bouton + flottant sur ordinateur** — Problème : la règle qui masque la barre et le bouton + du téléphone à partir de 768 px était écrasée (ordre CSS) ; un bouton + flottait en bas à droite sur tablette et ordinateur, deux boutons d'ajout entre 768 et 1023 px. Décision : barre et bouton + seulement sur téléphone. À reprendre sur Android : rien (déjà le cas).
- **Barre latérale** — Problème : chaque section (favoris, projets, zones, étiquettes…) défilait dans une boîte de 168 px, d'où une deuxième barre de défilement et une ligne coupée ; « Personnaliser la barre latérale » apparaissait deux fois. Décision : un seul défilement, celui du panneau ; les sections se replient par leur titre ; « Personnaliser » seulement dans le menu « … » du rail, qui se ferme avec Échap. À reprendre sur Android : tiroir en une seule liste défilante, sections repliables, aucune liste imbriquée qui défile.
- **Aujourd'hui** — Problème : le menu « … » s'ouvrait vers la gauche et sortait de l'écran à 375 px ; la citation du jour s'affichait par défaut ; à 768 px le calendrier du jour n'avait que 221 px et défilait de côté. Décision : le menu s'ouvre vers la droite et ne dépasse jamais l'écran ; citation désactivée par défaut (toujours dans « … ») ; si les deux colonnes ne tiennent pas (280 + 360 px), le calendrier passe sous la liste. À reprendre sur Android : pas de citation par défaut ; menus jamais rognés.
- **Boîte de réception** — Problème : « 3 éléments affichés sur 3 » répétait le compteur de l'en-tête. Décision : la ligne n'apparaît que s'il reste des éléments à charger. À reprendre sur Android : pas de compteur redondant en bas de liste.
- **Échéance passée** — Problème : date rouge sur les lignes de tâche, puce rouge dans le panneau, carte rouge avec « (il y a N jours) », triangle et badge « En retard » sur la page de tâche. Décision : une date passée s'affiche comme une autre date (aujourd'hui reste bleu) ; la page de tâche montre seulement la date. À reprendre sur Android : aucune couleur d'alerte ni « il y a N jours » pour une échéance passée, nulle part.
- **Page projet** — Problème : en Minimal, un bouton « + Ajouter » au-dessus de la ligne « + Ajouter une tâche » ; une carte « Personnes · 1 membre · vous, Propriétaire » sur chaque projet non partagé. Décision : le bouton n'apparaît que sur Tableau, Calendrier et Chronologie (et en Dense) ; la carte Personnes seulement si le projet est partagé avec quelqu'un (le partage part du bouton Partager de l'en-tête). À reprendre sur Android : un seul moyen d'ajouter par liste ; pas de section membres pour un projet personnel.
- **Habitudes** — Problème : onglet « Archivées 0 ». Décision : un compteur à zéro n'est pas affiché. À reprendre sur Android : pas de badge « 0 ».
- **Noms longs** — Problème : sur un sous-projet, le fil d'Ariane gardait le nom complet du parent et élargissait la page à 670 px sur un écran de 375 px ; un nom de tâche sans espace élargissait la page Insights. Décision : chaque élément du fil d'Ariane se tronque (nom complet en infobulle) ; les noms longs passent à la ligne. À reprendre sur Android : fil d'Ariane d'un sous-projet tronqué, jamais de défilement horizontal.
- **Vérification** : aucun débordement horizontal de la page à 375, 768, 1280 et 1920 px sur 21 écrans (seule la rangée d'onglets de la Revue défile dans sa propre bande, voulu).

### 2026-11-01 — Rejoindre une réunion depuis l'événement

- **Problème** : un événement dont le lieu ou la description contient un lien Meet, Zoom, Teams ou Webex obligeait à copier le lien ou à le chercher dans le texte.
- **Décision** : la fiche d'événement (modale Google) affiche un bouton « Rejoindre » sous le lieu dès qu'un lien de réunion est trouvé dans le lieu, puis dans la description. Détection pure dans `frontend/components/Calendar/eventLocation.ts` (`findMeetingLink`) : hôtes `meet.google.com`, `zoom.us`, `teams.microsoft.com`, `teams.live.com`, `webex.com`.
- **Android** : à reprendre. Même détection (le lieu puis la description), bouton « Rejoindre » dans la fiche d'événement qui ouvre le lien dans le navigateur ou l'application de réunion. Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Annuler une saisie d'habitude

- **Problème** : une saisie d'habitude (un tap, une valeur rapide ou un montant) était enregistrée sans retour ; une erreur de tap ne se rattrapait qu'en ouvrant l'entrée et en la supprimant.
- **Décision** : après chaque saisie réussie, un toast « {{nom}} noté » avec « Annuler » (6 s) supprime cette entrée (`deleteRow`, rechargement de la page). Le toast n'apparaît qu'une fois l'entrée enregistrée : un échec garde l'erreur habituelle. Un échec d'annulation affiche un toast d'erreur.
- **Android** : à reprendre. Après une saisie, un snackbar « Annuler » qui supprime la dernière entrée, comme les autres annulations de l'application. Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Passer une habitude aujourd'hui

- **Problème** : pour sauter un jour, il fallait ouvrir « Pause », choisir la date et le motif ; le seul geste était une pause de plusieurs jours.
- **Décision** : la page d'une habitude a « Passer aujourd'hui » (hors habitudes archivées). Il crée une pause d'un jour, motif Repos (`REST`), du jour à demain, comme sur Android : la série ne se casse pas. Le même bouton devient « Annuler le saut » tant que la pause du jour existe, et la supprime. Sans toast : l'état du bouton suit la pause.
- **Android** : à reprendre : rien, déjà le cas (`skipToday`, `cancelSkip`, motif Repos).

### 2026-11-01 — Supprimer avec annulation

- **Problème** : supprimer une tâche, une note ou une idée de la boîte demandait une fenêtre de confirmation avant chaque suppression, et rien ne se rattrapait ensuite.
- **Décision** : l'élément disparaît aussitôt, un toast « Annuler » dure 5 s (6 s à l'écran) ; sans annulation, la suppression part à la fin de ce délai, ou tout de suite si la page est quittée (requête `keepalive`). Une tâche récurrente garde son choix de portée. Une date ou un projet changé dans le menu clic droit propose aussi « Annuler » (voir l'entrée suivante). Mécanisme dans `frontend/utils/deferredDelete.ts`.
- **Android** : à reprendre. Même règle pour tâches, notes et idées : retrait immédiat, annulation pendant le délai, suppression ensuite. Reste : les suppressions de l'application ne sont pas encore toutes passées par ce délai.

### 2026-11-01 — Annuler une date ou un projet changé

- **Problème** : dans le menu clic droit d'une tâche, changer la date ou le projet était définitif : une erreur de clic se réparait à la main.
- **Décision** : après un changement enregistré, un toast « Annuler » (« Date modifiée » ou « Projet modifié ») remet l'ancienne valeur, heure comprise. Rien n'est proposé si l'enregistrement échoue, ni pour une tâche récurrente (son choix de portée décide déjà, et une portée annulée n'enregistre rien).
- **Android** : à reprendre. Le même « Annuler » après un changement de date ou de projet depuis le menu d'une ligne. Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Dupliquer une tâche

- **Problème** : pour refaire une tâche semblable, il fallait la recréer à la main : nom, note, projet, zone, étiquettes, priorité et dates.
- **Décision** : « Dupliquer » dans le menu clic droit et dans le menu d'actions de la page tâche. La copie reprend le nom, la note, le projet, la zone, les étiquettes, la priorité et les dates de début et d'échéance, et reste une tâche ouverte. Les sous-tâches, la récurrence, le statut et la tâche parente ne sont pas copiés. La copie s'ouvre (panneau latéral dans le menu, sa page dans la page tâche). Pas proposé pour une tâche de TODO.md. Le service `duplicateTask` (`frontend/utils/tasksService.ts`) passe par `POST /task` : aucun changement serveur.
- **Android** : à reprendre. Même copie depuis le menu d'une tâche, avec les mêmes champs exclus. Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Téléphones et e-mails cliquables

- **Problème** : un numéro ou une adresse écrit dans une note, une tâche ou la description d'un événement ne se touchait pas pour appeler ou écrire.
- **Décision** : dans le rendu markdown (notes, notes de tâche, aperçu de la description d'un événement Google), un numéro suisse ou français (`079 123 45 67`, `+41 79 123 45 67`) devient un lien `tel:`, une adresse un lien `mailto:`. Les dates, heures et années ne deviennent jamais des numéros. La description d'un événement Google affiche son rendu sous le champ quand il n'est pas vide. Logique dans `frontend/utils/contactLinks.ts`.
- **Android** : à reprendre. Mêmes règles de détection dans le rendu des notes, des tâches et des descriptions d'événement. Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Une case vide du calendrier crée une tâche

- **Problème** : cliquer une heure vide de la semaine ou du jour ouvrait un événement Google, ou ne faisait rien sans agenda Google accessible en écriture.
- **Décision** : une heure vide ouvre un petit choix : un champ « Nom de la tâche » et le bouton « Ajouter une tâche à 14:00 » (la tâche tombe ce jour-là, à cette heure, statut à faire). « Nouvel événement Google » reste en second choix, seulement si un agenda Google est accessible en écriture. Logique : `frontend/components/Calendar/slotTask.ts` et `SlotChoiceDialog.tsx`.
- **Android** : à reprendre. Même choix sur une heure vide de l'agenda. Reste : rien d'essayé sur le téléphone.
