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
