# Notes UX Android → web

Journal des décisions d'interface prises sur l'app Android, pour que le web les reprenne. Pendant de `WEB-UX-NOTES.md` (web → Android). Une entrée par changement : ce qui n'allait pas, ce qui a été décidé, ce que le web doit reprendre. Le comportement compte, pas le code Kotlin.

## Journal

### 2026-11-01 — Revue : « Plus tard » comme un fonds à parcourir

- **Problème** : la revue était une liste plate de cartes identiques avec un menu « Décider ▾ » ; un lien s'affichait en URL brute ; ~150 tâches « Plus tard » formaient un long déversement.
- **Décision** : « Plus tard » groupé par projet (puis domaine, puis « Sans projet »), groupes pliables avec leur nombre, triés par dernière activité, filtre en tête ; lignes compactes (liseré du projet, titre sur deux lignes, étiquettes). Toucher une ligne déplie les choix en pastilles d'un toucher ; « Annuler » après chaque décision. Balayage : droite = Aujourd'hui (la ressort de Plus tard), gauche = revoir dans 30 jours. « Trier un par un » : une tâche en grand, mêmes choix + « Passer », « N sur M », reprise. Les lignes qui ne sont qu'une adresse montrent la carte du lien. En-tête calme, sans compte des décisions ; onglets courts sous un fondu.
- **Web** : groupes, filtre, cartes de lien, « Faire aujourd'hui » et « Terminer » dans Plus tard repris sur `/review` ; le tri un par un et les pastilles d'un toucher restent à faire (`TODO.md`).

### Agenda — ajouter une tâche sur un créneau vide

- **Problème** : pour placer une tâche à une heure précise, il fallait passer par l'ajout puis l'échéance.
- **Décision** : toucher un créneau vide de la grille (Jour, 3 jours) ouvre l'ajout rapide, date et heure du créneau pré-remplies. Le créneau est la demi-heure touchée, arrondie vers le bas.
- **Web** : reprendre le même geste sur la vue jour du calendrier ; la saisie garde la date et l'heure du créneau.

### 2026-10-31 — « Inbox », pas « Boîte »

- **Problème** : l'onglet s'appelait « Boîte », un mot qui ne dit rien.
- **Décision** : « Inbox » partout (onglet, titre, cible de partage, messages). Commit `8d7d1097`.
- **Web** : en français, la page et la navigation disent « Inbox », jamais « Boîte » ni « Boîte de réception ».

### 2026-10-31 — Capture : choisir la destination

- **Problème** : le « + » de l'Inbox mettait seulement le curseur dans le champ, et les segments « Idées / Notes » en haut ressemblaient à des types de création.
- **Décision** : le « + » ouvre une feuille avec un choix Inbox · Tâche · Note (comme la cible de capture du web), Inbox d'office depuis l'Inbox, Tâche d'office depuis Tâches. En Inbox ou Note, le texte est gardé tel quel (aucune date ni #étiquette reconnue) ; une note créée s'ouvre dans son éditeur. Le titre et l'exemple du champ changent avec la destination.
- **Web** : la capture rapide garde le même ordre de destinations selon la page d'origine, et ne reconnaît dates et jetons que pour une tâche.

### 2026-10-31 — Les notes sont un onglet de Tâches

- **Problème** : on ne trouvait pas ses notes, cachées derrière un segment de l'Inbox.
- **Décision** : l'Inbox ne montre que les idées à trier (sous-titre « N idées à trier ») ; les notes ont leur onglet dans Tâches, entre Étiquettes et Terminées, et le « + » de cet onglet crée une note.
- **Web** : l'Inbox reste une liste d'idées à trier ; les notes ont leur entrée de navigation, pas un sous-onglet de l'Inbox.

### 2026-10-31 — Synchro : une demande ne doit jamais attendre derrière un échec

- **Problème** : un passage immédiat échoué hors ligne réessayait avec un recul exponentiel (jusqu'à 5 h) et bloquait toutes les demandes suivantes ; les modifications restaient « en attente ».
- **Décision** : un passage immédiat ne réessaie pas ; seul le passage périodique le fait, et le démarrage repart d'une file neuve. Commit `1357d09b`.
- **Web** : un envoi échoué n'empêche pas les suivants de partir ; le nombre de modifications en attente et l'erreur restent visibles.

### 2026-10-31 — Agendas utilisés

- **Problème** : chaque compte Google voit les mêmes agendas partagés, dont la moitié ne sont pas synchronisés : les listes semblaient en double.
- **Décision** : chaque agenda est « Utilisé dans Cadence » ou non (par défaut : synchronisé sur l'appareil) ; un agenda non utilisé n'apparaît nulle part, même pas dans les listes de choix. Réglages groupés par compte, non utilisés en dernier ; le nom du compte figure sous chaque agenda pour distinguer les homonymes. Pour chaque agenda : Agenda, Liste Tâches, Widget, réglables aussi depuis le panneau Affichage de l'Agenda. Commit `c2613061`.
- **Web** : pour les agendas Google, même choix en deux temps : d'abord lesquels sont utilisés, puis où ils s'affichent (calendrier, liste des tâches) ; les non utilisés disparaissent des sélecteurs.

### 2026-10-31 — Agenda : la grille d'abord

- **Problème** : environ 300 dp d'en-tête fixe au-dessus de la grille ; au défilement, une ligne de date répétait l'en-tête.
- **Décision** : en-tête sur une ligne, la période (« Samedi 31 octobre · S44 ») tenant lieu de titre, à côté de précédent · aujourd'hui · suivant ; au défilement, la bande de la semaine disparaît et les journées entières tiennent sur une ligne. Commit `a09ada1b`.
- **Web** : la vue jour/semaine ne répète pas la date ; ce qui n'est pas la grille horaire reste compact.

### 2026-10-31 — Agenda : distinguer tâche, habitude, événement

- **Problème** : tout avait le même rail coloré ; une habitude placée à son horaire (« Huile/Crème » à 18:00) ressemblait à un événement et ne se cochait pas.
- **Décision** : repère devant le titre : rond à la couleur de l'agenda pour un événement, case carrée pour une tâche (la coche), hexagone pour une habitude (plein une fois faite ; l'hexagone est réservé aux habitudes). Toucher une habitude ouvre sa saisie. Commit `b27cea8c`.
- **Web** : mêmes trois repères dans le calendrier et la liste du jour ; une habitude s'y note faite.

### 2026-10-31 — Bilan : revue des tâches de la semaine

- **Problème** : le Bilan parlait surtout des habitudes ; côté tâches, trois chiffres.
- **Décision** : après les chiffres, « Tâches de la semaine » : terminées par jour (lundi → dimanche, aujourd'hui en primaire plein), par projet (5 au plus), en retard (5 plus anciennes, puis « et N autres, dans Tâches ») ; toucher une tâche en retard l'ouvre. Commit `d4118a54`.
- **Web** : la page Revue/Insights montre la même lecture de la semaine.

### 2026-10-31 — Widget « Verre » : transparent, sans flou

- **Problème** : le verre s'affichait opaque (l'opacité réglée était écrasée à 100 %) ; le flou attendu derrière n'existe pas.
- **Décision** : opacité réelle corrigée (commit `86d97635`). Pas de flou : un widget ne peut pas flouter ce qui est derrière lui, et lire le fond d'écran demanderait l'« Accès à tous les fichiers ». Le verre reste une surface translucide réglable (opacité, reflet, liseré).
- **Web** : sans objet (le web floute avec `backdrop-filter`).

### 2026-10-31 — Widget : cases colorées, projet et étiquettes

- **Problème** : en couleur « Projet », toutes les cases avaient la même teinte (aucun projet n'a de couleur) ; le widget ne montrait ni projet ni étiquettes.
- **Décision** : un projet sans couleur rend la couleur de priorité (haute rouge, moyenne orange, basse bleue, aucune gris) ; une ligne discrète sous le titre donne « projet · #étiquettes », désactivable. Les événements gardent leur rond à la couleur de l'agenda.
- **Web** : dans les listes compactes, une case n'est jamais neutre par défaut quand la tâche a une priorité ; projet et étiquettes restent lisibles sous le titre.

### 2026-11-01 — Revue UI/UX : retard sans compteur, « Plus tard » sans double sens

- **Problème** : le bac « À planifier » de l'Agenda affichait « 5 j » en rouge (compteur de jours de retard) ; la fiche disait « En retard · 20 sept. » ; une tâche mise de côté (« Plus tard », `someday`) avec une vieille échéance restait rouge dans les lignes, la fiche et le bac.
- **Décision** : le bac et la fiche affichent « Échéance 20 sept. » (même texte que `dailyPlan.dueSince`), les plus anciennes échéances d'abord ; une règle unique (`TaskViews.isOverdue`) : échéance passée d'une tâche ouverte qui n'est pas mise de côté.
- **Web** : aucun compteur de jours dans le bac de planification du calendrier ; une tâche `someday` n'y est jamais proposée comme en retard.

### 2026-11-01 — « Sans date » au tri du matin

- **Problème** : « Plus tard » voulait dire deux choses : retirer l'échéance (tri « Planifier la journée ») et mettre de côté (`someday`, revue et fiche).
- **Décision** : le tri du matin dit « Sans date » (« 3 tâches sans date ») ; « Plus tard » est réservé à la mise de côté.
- **Web** : le planificateur du jour garde « Plus tard » pour un créneau plus tard dans la journée ; s'il retire l'échéance, il dit « Sans date ».

### 2026-11-01 — Messages et projets

- **Problème** : les messages d'un balayage ne nommaient pas la tâche (« Tâche supprimée ») ; dans la page d'un projet, chaque ligne répétait le nom du projet déjà en tête ; les statuts « Pas commencé » et « Planifié » différaient du web ; rien ne disait que « En pause » range le projet dans le Stash.
- **Décision** : « « Acheter du pain » supprimée / replanifiée / sans date / changée de projet », « Priorité de « … » modifiée » ; les lignes d'un projet n'affichent plus son nom ; statuts « Non commencé » et « Prévu » comme le web ; dans le choix du statut, sous-titres « Dans le Stash, à reprendre plus tard » (En pause), « Décidé de ne pas poursuivre » (Abandonné), « Consultable, hors de vue » (Archivé).
- **Web** : les toasts nomment l'élément ; le sélecteur de statut de projet montre ces trois descriptions.

### 2026-11-01 — Fiche de tâche et cibles tactiles

- **Problème** : un badge « Priorité » vide encombrait la fiche d'une tâche sans priorité (la ligne Priorité existe plus bas) ; la croix « Retirer la date » (20 dp), la ligne « Revoir le… » et l'anneau du widget Liste (24 dp) étaient trop petits ; les cases des sous-tâches et des listes de notes n'avaient pas de nom pour TalkBack ; les trois pastilles d'une idée de l'Inbox débordaient en grande police.
- **Décision** : badge de priorité seulement s'il y en a une ; cibles de 48 dp (40 dp dans le widget) ; chaque case porte le nom de son élément, une sous-tâche faite est barrée ; les pastilles passent à la ligne.
- **Web** : un badge n'apparaît que pour une valeur posée ; une case de sous-tâche a un libellé accessible.

### 2026-11-01 — Rappels, partage, épingle, sous-tâches, copie

- **Problème** : une notification de tâche ne proposait que « 10 min » et « 1 h » ; une tâche ne se partageait, ne s'épinglait ni ne se dupliquait ; une sous-tâche ne se renommait ni ne s'ouvrait ; le titre long de la fiche était coupé après deux lignes.
- **Décision** : la notification propose « Fait », puis « À la fin » (échéance plus durée estimée, masqué si moins de 5 min restent ou sans estimation) ou « 10 min », puis « Demain » (même heure le lendemain) ; « 1 h » disparaît (trois actions au plus). Les fiches de tâche, les notes et les cartes de lien ont « Partager » et « Copier » (titre, puis note après une ligne vide ; un lien : titre et adresse). La fiche a « Épingler » / « Désépingler » (`pinned_at`), « Dupliquer » (contenu, dates, durée, projet, domaine, étiquettes ; la copie repart à faire, non épinglée, sans rappel ni parent). Toucher une sous-tâche ouvre « Renommer », « Ouvrir comme tâche » (fiche par-dessus) ou « Supprimer » avec « Annuler ». Un titre de plus de 60 caractères passe en corps plus petit et s'affiche en entier.
- **Web** : vérifier que « À la fin » et « Demain » existent dans le rappel web (ou les noter dans `TODO.md`) ; le web doit dupliquer et partager avec les mêmes champs ; une sous-tâche doit pouvoir se renommer et s'ouvrir depuis sa ligne.

### 2026-11-01 — Échues sans compteur, filtre de domaines à partir de deux

- **Problème** (QA sur émulateur) : l'en-tête de Tâches disait « Dim. 1 nov. · 41 en retard » et la section « En retard 41 » était rouge, comme les pastilles de date et le chiffre du Bilan ; la rangée « Tous · Bucket list » s'affichait avec un seul domaine ; « Déplacer vers un projet » proposait des projets terminés.
- **Décision** : en-tête limité à la date ; section « Échues », sans compteur ni rouge, chaque ligne garde sa date sur une pastille neutre ; Bilan « N échues » en couleur normale ; carte du matin « N à replanifier ». La rangée de domaines n'apparaît qu'à partir de deux domaines (un filtre gardé sur un domaine resté seul est ignoré). Les choix de projet n'offrent que les projets ouverts (actifs et stash), plus le projet actuel de la tâche.
- **Web** : vérifier qu'aucun en-tête ou titre de section ne compte les tâches échues et que le sélecteur de domaine est masqué sous deux domaines ; ne proposer que les projets ouverts pour ranger une tâche.

### 2026-11-01 — Agendas : masquer partout, doublons, widget

- **Problème** : la feuille Affichage de l'Agenda n'offrait que Agenda / Tâches (pas de « masquer partout » sans passer par les Réglages) ; un événement présent sur deux agendas (invité en perso et au travail, agenda partagé abonné deux fois) apparaissait deux fois ; le widget Aujourd'hui cachait les événements par défaut, dans un bloc à part.
- **Décision** : chaque agenda a trois puces, Agenda · Liste Tâches · Masquer partout (celle-ci ne montre l'agenda nulle part et le laisse listé pour le rendre). Doublon = même titre (rogné, sans casse), même début et même fin (ou même jour entier), lieux compatibles, agendas différents ; on garde l'agenda principal du compte, sinon le premier. Le widget affiche les événements par défaut, mêlés aux tâches du jour par heure comme l'onglet Aujourd'hui, et suit le réglage « Liste Tâches » de l'agenda.
- **Web** : le calendrier dédoublonne les événements de plusieurs flux ou calendriers Google avec la même clé (`dedupeCalendarEvents`, agenda Google principal prioritaire) ; le « masquer partout » existe déjà par calendrier (`show_on_calendar`).

### 2026-11-01 — Trier les liens de l'Inbox : quatre décisions d'un toucher

- **Problème** : une idée qui contient un lien n'offrait que Aujourd'hui / Planifier / Projet (la mettre dans le calendrier) et un toucher ouvrait l'URL. Pour un lien « à voir un jour », aucune de ces trois actions n'est la bonne : il faut garder, tester, repousser ou jeter, vite, sans culpabilité.
- **Décision** : la carte d'un lien montre le titre, deux lignes de description, le domaine, le type, les étoiles d'un dépôt et la note ; la toucher la déplie (début du README, champ « Ajouter une note », étiquettes). « Ouvrir » est une icône à part. Quatre pastilles calmes : Garder (statut `kept`), À tester (crée la tâche « Tester : titre », note = l'adresse puis la note du lien, dans le projet choisi ou sans projet ; statut `tested`), Plus tard (`parked`, revue dans 30 jours), Jeter (`dropped`). Chaque décision marque l'idée `processed` (elle quitte l'Inbox sans être supprimée, le lien reste dans la bibliothèque) et une bannière « Annuler » nomme le lien ; rien n'est écrit avant la fin de la fenêtre. « Plus… » garde Aujourd'hui / Planifier / Projet. Glisser à droite garde, à gauche jette. À partir de deux liens, « Trier les liens (n) » les montre un par un, pleine largeur, avec « Passer » (le lien repart au bout de la file).
- **Web** : l'inbox web doit reprendre ce qui manque à la carte de lien (aujourd'hui : carte, note, ouverture) : (1) les quatre décisions Garder / À tester / Plus tard / Jeter en boutons de la carte, avec « Plus… » pour convertir en tâche ; (2) la décision marque l'`inbox_item` `processed` (statut déjà éditable) et met le statut du lien (`PATCH /api/links/:uid`) ; (3) « À tester » crée « Tester : titre » avec l'adresse et la note en note de tâche ; (4) un clic sur la carte déplie README, note et étiquettes, l'ouverture est un bouton séparé ; (5) un mode « Trier les liens » (un lien à la fois). Un champ serveur `review_at` pour « Plus tard » (revue à 30 jours) manque : sur Android la date n'est que locale, donc le web ne peut pas encore l'afficher.

### 2026-11-01 — Objectifs : un onglet de Tâches et une fiche modifiable

- **Problème** : les objectifs et la liste d'envies n'étaient joignables que par une carte en bas du Bilan, en lecture seule ; une envie ne pouvait ni être corrigée ni devenir une tâche.
- **Décision** : onglet « Objectifs » dans Tâches (après Étiquettes) et résultats « Objectifs » dans la recherche ; la carte du Bilan reste. Toucher un but ouvre une fiche : nom, note, type (envies), état, « Créer une tâche » (ajout rapide prérempli, tâche liée par `goal_uid`), « Supprimer » avec « Annuler ».
- **Web** : la barre latérale montre déjà Objectifs (section par défaut ; en disposition Minimal, dans le rail). Repris : « Créer une tâche » sur une envie et « Tâches liées : N ». La recherche web trouve déjà les objectifs (palette Ctrl+K).

### 2026-11-01 — Notification d'événement : reporter à la fin ou de 10 min

- **Problème** : une notification d'événement ne proposait que « Ouvrir l'agenda » et « Fait » ; pour un rendez-vous long, le rappel tombait trop tôt pour savoir s'il était fini.
- **Décision** : « À la fin » reveille au moment où l'événement se termine (masqué si moins de 5 min restent ou journée entière) et « 10 min » reveille dix minutes plus tard. Le rappel repris relit l'événement : fait, masqué, déplacé ou supprimé, il se tait ; les heures calmes décalent le réveil.
- **Web** : rien à reprendre tant que l'agenda web n'envoie pas de rappels à reporter.

### 2026-11-01 — Téléphones, mails et liens cliquables dans les descriptions

- **Problème** : un numéro ou une adresse dans la description d'un événement ou dans une note n'était pas touchable ; seules les URL l'étaient dans les notes.
- **Décision** : `tel:` (numéros suisses et français, reconnus avec ou sans indicatif), `mailto:` et URL, dans les notes markdown et la description d'un événement. Les dates et heures ne sont pas prises pour des numéros.
- **Web** : à reprendre dans les descriptions d'événements et les notes si le web ne linkifie pas déjà les numéros et adresses.

### 2026-11-01 — Rejoindre une réunion depuis la fiche d'événement

- **Problème** : une visio (Meet, Zoom, Teams, Webex) collée dans le lieu ou la description fallait être recopiée à la main.
- **Décision** : bouton « Rejoindre » pleine largeur au-dessus des actions quand le lieu ou la description contient un lien de visio ; même liste d'hôtes que le web (`findMeetingLink`).
- **Web** : la fiche d'événement web a déjà `findMeetingLink` ; rien à reprendre.

### 2026-11-01 — Ouvrir un événement dans l'agenda système

- **Problème** : depuis la fiche d'un événement, impossible d'aller voir l'événement complet (invités, rappels, pièces jointes) dans l'agenda du téléphone.
- **Décision** : « Ouvrir dans l'agenda » (action secondaire) lance l'événement par `ACTION_VIEW` à son heure de début ; sans application d'agenda, un message le dit.
- **Web** : l'agenda web a déjà l'événement ouvert dans son propre panneau ; à reprendre seulement si le web ajoute un lien vers le fournisseur.

### 2026-11-01 — Capturer sans ouvrir l'application

- **Problème** : pour noter une idée il fallait ouvrir l'application ; le texte sélectionné ailleurs ne pouvait pas partir directement dans Cadence.
- **Décision** : raccourci statique « Nouvelle tâche » sur l'icône, tuile « Capturer » dans les réglages rapides (ouvre l'ajout rapide), et entrée « Cadence » dans le menu de sélection (`PROCESS_TEXT`), qui range le texte dans l'Inbox comme le partage.
- **Web** : pas d'équivalent système ; la capture rapide web reste la palette Ctrl+K.

### 2026-11-01 — Idée de l'Inbox : modifier et convertir en note

- **Problème** : une idée captée trop vite ne se corrigeait pas, et pour garder une réflexion il fallait la recopier à la main dans une note.
- **Décision** : deux pastilles discrètes et « Note » à côté de « Aujourd'hui », « Planifier » et « Projet » ; « Modifier » ouvre un champ de texte. « Note » crée une note (titre = première ligne, contenu = la suite) par la voie d'écriture des notes, puis retire l'idée de la boîte.
- **Web** : l'Inbox web a déjà l'édition et la conversion d'une idée ; à reprendre seulement si le web ajoute « Note ».
