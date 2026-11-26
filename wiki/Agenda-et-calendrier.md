# Agenda et calendrier

Le calendrier montre vos tâches à leur vraie durée à côté de vos rendez-vous, sur six vues. Il se synchronise avec Google Agenda et Google Tasks dans les deux sens, lit les calendriers iCal que vous lui donnez, et publie lui-même vos tâches sous forme de flux ou de calendrier CalDAV. Sur Android, la même chose s'appelle l'**Agenda** et lit les calendriers du téléphone.

![Le calendrier en vue semaine](images/web/calendar.png)

## Les vues du calendrier (web)

L'en-tête de la page affiche « Calendrier » avec le mois en sous-titre, un sélecteur de vue, les boutons précédent, **Aujourd'hui** et suivant, l'impression et les options.

| Vue | Ce qu'elle montre |
|---|---|
| **Année** | Les douze mois en petites grilles ; chaque jour est teinté selon le nombre d'éléments qu'il porte (une barre de journée entière compte sur chaque jour qu'elle couvre). Un clic sur un jour l'ouvre en vue Jour ; les flèches avancent d'un an |
| **Mois** | Une grille du mois ; les tâches de plusieurs jours sont des barres qui gardent la même rangée toute la semaine |
| **Semaine** | La grille horaire de sept jours, une rangée « Toute la journée » en haut |
| **N jours** | La grille de 2 à 7 jours à partir de la date courante (3 par défaut) ; les flèches avancent de N jours ; sans week-ends, N compte les jours ouvrés |
| **Jour** | La grille d'une journée |
| **Agenda** | Le mois, jour par jour : chaque jour qui a quelque chose a son titre, les journées entières d'abord. Il s'ouvre au jour d'aujourd'hui (ou au prochain jour non vide) ; les flèches avancent d'un mois |

Les **numéros de semaine** (ISO) et un **mini-calendrier** à côté des vues sont facultatifs. Le bouton d'impression n'imprime que la vue affichée, sans barre latérale ni barre d'outils.

### Sur téléphone et petit écran

Sous 640 px, le sélecteur de vue se réduit à quatre segments (Mois, Semaine, Jour, Agenda) avec « Autres vues » pour Année et N jours. La vue Mois montre un point de couleur par événement (trois au plus) ; toucher un jour liste ses événements sous la grille.

## Comment les tâches sont dessinées

Une tâche n'a pas une taille unique : elle prend sa vraie longueur.

| Situation | Dessin |
|---|---|
| Échéance avec heure, début plus tôt le même jour | Un bloc du début à l'échéance ; tirer son bord inférieur change l'heure d'échéance |
| Échéance avec heure, sans début | Un bloc qui commence à l'heure d'échéance et dure l'estimation de la tâche (une heure sans estimation) ; tirer le bord règle l'estimation par pas de 15 minutes, de 5 minutes à 12 heures |
| Échéance sur la journée entière | Une barre dans la rangée « Toute la journée », du début (s'il est plus tôt) à l'échéance. Dans le Mois, elle apparaît dans chaque jour couvert |
| Échéance horaire avec début un jour antérieur | Une barre aussi |
| Différer jusqu'à | Un bloc d'une heure à cette heure |
| Tâche récurrente | La tâche à sa date courante, puis ses occurrences suivantes (jusqu'à la fin de la période chargée : le mois plus une semaine de chaque côté) en bleu plus clair |
| Tâche terminée | En vert, tant que « Afficher les terminées » est actif |

Les occurrences à venir d'une série **ne se déplacent pas** : déplacez l'occurrence courante et la suite suit. Quand vous déplacez ou redimensionnez l'occurrence courante, la question « cette occurrence ou la série ? » apparaît (voir [Tâches](Taches)).

### Glisser et déposer

- Déplacer un bloc garde sa durée : pour un bloc début-échéance, les deux extrémités bougent ; une barre déplace son début et son échéance du même nombre de jours en gardant leurs heures.
- Déposer sur une heure de la vue Semaine ou Jour fixe l'heure là où le haut du bloc tombe, **par pas de 15 minutes**. Déposer dans le Mois ou dans la rangée « Toute la journée » garde l'heure.
- Cliquer une tâche l'ouvre dans la fiche, à son propre jour pour une occurrence ultérieure.

### Le panneau « Planifier les tâches »

Le bouton **« Planifier les tâches »** ouvre un panneau latéral à deux onglets : **« Sans date »** (tâches ouvertes sans échéance) et **« En retard »** (ouvertes, échues avant aujourd'hui). Les tâches terminées, annulées, les sous-tâches, les habitudes et les aperçus de récurrence en sont exclus. Les tâches sont groupées par projet en sections repliables, filtrables par projet, étiquette et priorité. Glissez-en une sur le calendrier : sur un jour du Mois (ou dans la rangée « Toute la journée »), elle prend cette échéance ; sur une heure de la vue Semaine ou Jour, elle prend cette échéance **et** cette heure.

### Une case vide crée une tâche

Cliquer une heure vide (vues Semaine, N jours et Jour) propose **« Ajouter une tâche à 14:00 »** : une tâche due ce jour-là à cette heure (sans début). Quand un calendrier Google est modifiable, le même menu propose aussi **« Nouvel événement Google »**.

## Options d'affichage

Le bouton « Options d'affichage » (curseurs) règle ce qui suit, enregistré dans votre profil, donc identique d'un navigateur à l'autre :

| Option | Effet (valeur par défaut) |
|---|---|
| Afficher les terminées | Les tâches faites restent en vert (activé) |
| Afficher les week-ends | Désactivé : le Mois et la Semaine n'ont plus samedi ni dimanche et le Jour les saute (activé) |
| Afficher toutes les répétitions | Désactivé : chaque tâche récurrente reste à sa date courante (activé) |
| Afficher les habitudes | Les jours dus des habitudes, un élément par habitude et jour (activé), voir plus bas |
| Jours dans la vue multi-jours | De 2 à 7 (3) |
| Afficher les numéros de semaine | Numéros ISO sur chaque ligne du Mois et dans le coin de la Semaine (désactivé) |
| Afficher le mini-calendrier | Un petit mois à côté des vues, sur écran large (désactivé) |
| Afficher les sessions de focus | Les sessions terminées en blocs orange à l'heure où elles ont eu lieu (activé) |
| Jours fériés | Pays et région (« Tout le pays ») : les jours fériés sont des éléments rouges sur la journée ; ils ne comptent pas dans la vue Année |
| Heures visibles | De 0 h à 24 h par défaut ; réduire la fenêtre masque la nuit |
| Couleur selon | Par défaut, Projet, Priorité (rouge, ambre, bleu) ou Étiquette ; une tâche sans projet ni étiquette est grise ; une tâche faite reste verte |

### Habitudes sur le calendrier

Un élément par habitude et par jour dû : une pastille « journée entière » à la couleur de l'habitude, ou un bloc de 30 minutes à l'heure du **premier rappel actif** de ce jour. Un jour réussi porte une coche. Les jours de pause sont omis. Une habitude « 3 fois par semaine » ou un suivi libre n'apparaît que les jours où il a été fait, puisqu'il n'est pas dû un jour donné. Cliquer ouvre la page de l'habitude ; les cases se cochent depuis l'habitude. Voir [Habitudes](Habitudes).

### Heures visibles et barres « avant / après »

Quand la fenêtre des heures visibles est réduite, un élément daté hors fenêtre est compté dans une barre en haut (« 2 avant ») ou en bas (« 3 après ») de la grille, avec une pastille par colonne en vue Semaine ou N jours ; le survol les liste. Un clic sur la barre montre toute la journée pour la session ; « Masquer les heures tôt et tard » rétablit la fenêtre. La zone cachée est rayée. La même fenêtre s'applique au calendrier d'Aujourd'hui (voir [Aujourd'hui et plan du jour](Aujourd-hui-et-plan-du-jour)).

## Événements

### Ce que vous voyez d'un événement

Cliquer un événement d'un agenda iCal ou d'un calendrier Google ouvre une **fiche de lecture** : titre, jour et heure, nom de l'agenda, lieu, description. Le même geste marche dans Aujourd'hui, dans Planifier (calendrier fusionné) et sur la page Calendrier.

- **Lieu** : une adresse postale s'ouvre dans Google Maps ; une adresse web s'ouvre telle quelle. Un bouton **Copier l'adresse** copie le lieu (« Adresse copiée »).
- **Rejoindre** : un bouton apparaît quand le lieu ou la description contient un lien de visioconférence (Meet, Zoom, Teams ou Webex).
- **Description** : Google la garde en HTML ; Cadence l'affiche et l'édite en texte simple (paragraphes, sauts de ligne, éléments de liste). Une description non modifiée n'est pas renvoyée à l'enregistrement, donc sa mise en forme reste dans Google.
- **Un même événement, une seule fois.** Un événement porté par plusieurs flux ou calendriers Google (même titre, même jour, même début, même fin) n'est montré qu'une fois ; le calendrier Google principal l'emporte. Android applique la même règle.

### Créer, modifier, supprimer (calendriers Google bidirectionnels)

Sur un calendrier réglé en « Bidirectionnel » :

- **Créer** : cliquer une heure vide (événement d'une heure) ou un jour du Mois ou de l'en-tête de la Semaine (journée entière).
- **Modifier** : cliquer l'événement, puis **« Modifier »** ; titre, agenda, début, fin, lieu, description. « Ouvrir dans Google Agenda » mène à sa page quand elle existe.
- **Supprimer** : le bouton demande un second clic (« Supprimer pour de bon ? »).
- **Déplacer ou étirer** : par glisser dans la grille. Les événements en lecture seule restent fixes et disent pourquoi au survol ; un événement sur plusieurs jours reste fixe.
- **Événement répété** : on ne change qu'une occurrence à la fois (Google la garde comme exception). Pour modifier toute la série, passez par Google Agenda.

## Synchronisation avec Google Agenda et Google Tasks

La synchronisation est **dans les deux sens**, pour un compte Google par utilisateur. Elle se règle dans Profil › Organisation › Calendriers (ou par le bouton **« Agendas »** de la page Calendrier).

### Brancher Google

Il faut d'abord que l'administrateur du serveur ait créé un client OAuth Google (voir [Auto-hébergement](Auto-hebergement)) ; sans cela la section affiche « Pas configuré sur ce serveur : l'administrateur définit GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET ». Ensuite, **« Connecter Google »** ouvre la connexion Google, et la première synchronisation (« première synchronisation en cours… ») lit les 90 derniers jours et tout ce qui est à venir. Sur Android : Réglages › Agendas › **« Connecter Google »**, qui ouvre le navigateur du téléphone puis revient dans l'application ; en cas d'échec ou de jeton expiré, le bouton devient **« Reconnecter Google »** avec la dernière erreur.

### Trois réglages d'un calendrier

Chaque calendrier a un **mode** dans une liste à côté de son nom :

| Mode | Effet |
|---|---|
| **Masqué** | Non lu, affiché nulle part (ni Calendrier, ni Aujourd'hui, ni brouillon IA) ; ses copies sont supprimées, le rebrancher relit tout |
| **Lecture seule** (par défaut) | Affiché mais non modifiable, même si Google l'autoriserait |
| **Bidirectionnel** | Modifiable ; proposé seulement si Google laisse le compte écrire (propriétaire ou rédacteur) |

Un interrupteur d'affichage à côté du mode (« Afficher *nom* sur la page Calendrier ») ne règle que l'affichage. Un calendrier masqué dans Google reste masqué la première fois. Un calendrier non affiché est aussi laissé de côté par Aujourd'hui, le plan et le brouillon IA : ses rendez-vous ne bloquent plus de temps.

Deux autres réglages : **« Agendas, et tâches datées dans un agenda « Cadence » »** (interrupteur événements) et **« Toutes les tâches avec Google Tasks (une liste par projet) »** (interrupteur tâches), chacun activable séparément.

### Où va chaque tâche

Avec les deux interrupteurs, **chaque tâche va à Google une seule fois** :

| Votre tâche | Dans Google |
|---|---|
| Avec une **heure** d'échéance | Un événement du calendrier « Cadence » (créé à la première synchronisation) |
| Sans date, ou avec une date sans heure | Une tâche Google Tasks |
| Sans projet | Dans la liste par défaut de Google Tasks |
| Dans un projet | Dans une liste Google Tasks du même nom (créée au besoin, y compris côté projet quand il reçoit sa première tâche) |

Si une tâche gagne une heure, elle quitte Google Tasks pour devenir un événement à la synchronisation suivante, et l'inverse. Avec un seul interrupteur, ce côté prend toutes les tâches qu'il peut contenir (événements seuls : toute tâche datée, en journée entière quand elle n'a pas d'heure ; tâches seules : toutes les tâches).

Le réglage **« Agenda des tâches avec une heure »** permet de choisir un autre calendrier que « Cadence » pour recevoir ces événements (n'importe lequel où Google autorise l'écriture). Dans un calendrier choisi, seuls les événements marqués par Cadence sont des tâches : vos autres événements restent des événements ordinaires. Changer ce choix déplace les événements des tâches à la synchronisation suivante ; un calendrier choisi qui disparaît ou devient en lecture seule retombe sur « Cadence ».

### Ce que Google fait à vos tâches, et réciproquement

- Un événement déplacé ou redimensionné dans Google déplace la tâche (échéance, début ou estimation) ; renommé, il renomme la tâche.
- **Supprimer l'événement dans Google retire la date de la tâche** : la tâche reste.
- Une tâche terminée quitte le calendrier ; une tâche sans date n'y est pas.
- Un événement ajouté au calendrier « Cadence » dans Google devient une **nouvelle tâche** (seul ce calendrier le fait). Un événement d'une journée entière ajouté là devient une tâche sans heure et passe dans Google Tasks.
- Une tâche récurrente n'apparaît que par sa **prochaine occurrence**. Les événements créés sont « libres » : ils ne bloquent pas votre disponibilité dans Google.
- Google Tasks synchronise le titre, la note, l'état fait, le **jour** d'échéance (pas l'heure), le lien parent-sous-tâche et la liste ↔ projet. Quand Google garde le même jour, l'heure posée dans Cadence reste.
- **Supprimer une tâche dans Cadence** la supprime de Google Tasks. **La supprimer dans Google Tasks la marque faite dans Cadence** (avec son heure de fin ; une récurrente s'arrête) plutôt que de la supprimer : la rouvrir ou la modifier la renvoie.
- Supprimer toute une liste dans Google ne supprime pas les tâches de Cadence : elles sont dissociées et repartent dans une nouvelle liste.
- Une tâche terminée depuis plus de 7 jours avant la première synchronisation n'est pas envoyée ; une tâche Google déjà terminée avant n'est pas importée.
- Ne sont **pas** synchronisés : priorité, étiquettes, statuts autres qu'ouvert ou fait (en cours, en attente et planifié restent ouverts dans Google ; archivé et annulé sont retirés de Google), habitudes et occurrences d'une série.

### Quand et en cas de conflit

Le serveur synchronise toutes les 2 minutes par défaut (réglable de 1 à 60 minutes par l'administrateur), tout de suite après la connexion ou un changement de réglage ; **« Synchroniser »** lance une passe à la demande. Les modifications faites depuis la page Calendrier partent immédiatement. Quand seul un côté a changé, il l'emporte. Quand les deux ont changé depuis la dernière passe, **la modification la plus récente gagne**, et le journal garde la trace.

### Journal de synchronisation

Sous **« Journal de synchronisation »** (replié, chargé à l'ouverture, actualisé après chaque passe) : les 50 dernières entrées, la plus récente en haut, avec l'heure, le type et un message, relié à la tâche quand il y en a une.

- **Conflit** : un élément a changé des deux côtés ; le message dit quelle modification a été gardée.
- **Erreur** : un élément refusé par Google (la passe continue), ou une passe entière échouée.
- **Info** : une tâche marquée faite parce que sa tâche Google a été supprimée, un événement déplacé vers un autre calendrier.

Si **toute une passe** échoue (accès révoqué ou expiré, Google injoignable), une alerte rouge unique apparaît dans la cloche, sur le téléphone et sur le client Linux, jusqu'à ce qu'une passe réussisse ; un clic ouvre Profil › Calendriers sans la marquer lue. Voir [Notifications et rappels](Notifications-et-rappels).

### Déconnecter

**« Déconnecter »** révoque l'accès et supprime toutes les copies et liens Google gardés dans Cadence. Vos tâches Cadence restent ; ce qui est déjà dans Google y reste aussi (le calendrier « Cadence » et les listes comprises). Couper un seul interrupteur dissocie ce côté seulement ; le rallumer repart d'un lien neuf, ce qui peut créer des doublons pour ce qui est resté dans Google entre-temps.

### Limites

Un compte Google par utilisateur ; on ne modifie pas une série entière de Google depuis Cadence ; Google Tasks perd l'heure du jour (le calendrier « Cadence » la garde) ; les tâches que quelqu'un partage avec vous dans son projet ne sont pas envoyées (seules les tâches dont vous êtes propriétaire).

## Calendriers iCal (lecture seule)

Profil › Organisation › Calendriers, ou le bouton **« Agendas »** de la page Calendrier, connecte des flux **iCal en lecture seule** : l'« adresse secrète au format iCal » de Google Agenda, Apple Calendrier, Outlook, Fastmail, ou un lien `webcal://`.

1. **« Connecter un calendrier »** : un nom (Travail, Famille…), l'adresse iCal secrète et une couleur.
2. **« Connecter »** vérifie le flux (« Vérification du calendrier… ») et le refuse s'il est illisible.
3. Chaque calendrier est une pastille au-dessus des vues du Calendrier : un clic affiche ou masque ses événements (« Afficher *nom* sur la page Calendrier »), réglage mémorisé par calendrier. Un calendrier masqué est aussi laissé de côté par Aujourd'hui, le plan et le brouillon IA.

Cadence **n'écrit jamais** dans ces calendriers. Leur adresse est un secret : elle est chiffrée sur le serveur et seul l'hôte est renvoyé à l'écran. Le serveur lit le flux par une porte de sécurité (adresses publiques seulement, chaque redirection vérifiée, 10 secondes et 5 Mo au plus), le garde 15 minutes en cache, et développe les événements répétés (RRULE, exceptions, instances déplacées), les fuseaux, les journées entières et les événements qui passent minuit dans votre fuseau. Un événement annulé est ignoré. Si un flux cesse de répondre, Aujourd'hui garde la dernière copie en cache et l'erreur s'affiche dans l'onglet Calendriers (« Impossible de charger : *nom* »). Pour les calendriers situés sur un réseau privé, l'administrateur doit autoriser les adresses privées.

## Publier vos tâches vers un autre calendrier

Profil › Organisation › Calendriers › **« S'abonner à vos tâches »** crée une adresse secrète `https://cadence.example.com/api/feeds/tasks/tf_….ics` à coller dans Google Agenda (« À partir de l'URL »), Apple Calendrier ou Outlook.

- **« Créer une adresse »** la fabrique ; elle n'est affichée **qu'une fois** (« Copiez-la maintenant »). Seule une empreinte est conservée. **« Créer une nouvelle adresse »** remplace l'ancienne, qui cesse aussitôt de marcher ; **« Désactiver »** la supprime.
- Le flux liste vos tâches ouvertes avec une échéance, de 60 jours avant à 400 jours après, hors tâches faites, archivées ou annulées, dessinées comme dans le Calendrier (bloc horaire, ou événement de journée entière du début à l'échéance). Les récurrentes n'apparaissent qu'à leur date courante.
- Toute personne qui possède l'adresse peut lire ces tâches : traitez-la comme un mot de passe.

## CalDAV

Cadence parle CalDAV dans les deux sens, par défaut.

### Utiliser Cadence comme serveur de tâches

Des applications comme **tasks.org** (Android), **Rappels** d'Apple (iOS et macOS), **Thunderbird** et **Evolution** se connectent directement à Cadence : saisissez l'adresse `https://cadence.example.com/caldav/`, votre e-mail et votre mot de passe, puis choisissez le calendrier des tâches. Thunderbird et Evolution demandent l'adresse complète `…/caldav/<utilisateur>/tasks/`. Une même instance peut être lue par plusieurs applications à la fois : les changements de l'une arrivent dans les autres.

- Avec la **double authentification**, le mot de passe du compte ne marche plus en CalDAV : utilisez une **clé API** comme mot de passe.
- Une tâche supprimée dans le client est supprimée dans Cadence à la synchronisation suivante (en mode bidirectionnel).
- L'administrateur peut servir **un calendrier par projet** (plus « (No Project) ») : Rappels montre alors une liste par projet, un projet partagé avec vous apparaissant avec ses tâches (en lecture seule si le partage l'est).
- Les champs : nom ↔ titre, note ↔ description, échéance, « Différer jusqu'à » ↔ début, fin ↔ date de fin, récurrence ↔ règle de répétition, sous-tâches ↔ lien parent, priorité inversée (haute 3, moyenne 5, basse 7). Les sept statuts se replient en quatre (non commencé, en attente et planifié donnent « à faire »). Les projets, étiquettes et le mode habitude voyagent en champs propres que les clients n'affichent pas.
- Limites : les clients voient les occurrences individuelles (365 à venir) ; modifier une occurrence crée une exception ; supprimer la tâche parente supprime toutes les occurrences.

### Se synchroniser avec un serveur CalDAV distant

Profil › Intégrations › Synchronisation CalDAV : **« Ajouter un calendrier »** (nom, description, couleur, adresse du serveur, chemin du calendrier, authentification de base ou jeton d'accès) relie Cadence à Nextcloud, Baïkal, iCloud ou Radicale.

| Réglage | Choix |
|---|---|
| **Sens** | Bidirectionnel (par défaut), « Tirer uniquement » (importer), « Pousser uniquement » (exporter) |
| **Intervalle** | 5, 15 (défaut), 30, 60 minutes ou manuel |
| **Conflits** | Dernière écriture gagnante (défaut), Cadence gagne, serveur distant gagne, ou résolution manuelle (« Conflits » liste les deux versions côte à côte) |

**« Synchroniser maintenant »** force une passe ; « Dernière synchronisation » et le nombre de conflits s'affichent par calendrier. Les mots de passe distants sont chiffrés. Par défaut, un calendrier distant doit être en HTTPS sur une adresse publique ; un NAS ou un Nextcloud sur le réseau local demande à l'administrateur d'autoriser les adresses privées.

## Sur Android : l'Agenda

L'onglet **Agenda** affiche les événements des calendriers du téléphone, vos tâches et vos habitudes. Il lit le calendrier de l'appareil (autorisation « Afficher vos agendas ») et ne l'écrit jamais.

- **Quatre modes** : **Jour**, **3 jours**, **Mois** et **Liste** (les prochains jours). L'en-tête est sur une ligne : la période (« Samedi 31 octobre · S44 ») tient lieu de titre, à côté de précédent, « Aujourd'hui » et suivant. **Glisser horizontalement** change la période dans tous les modes.
- **Trois repères** : un rond à la couleur de l'agenda pour un événement, une case carrée pour une tâche (elle se coche), un hexagone pour une habitude (plein une fois faite, touché il ouvre sa saisie). Toucher le corps d'une tâche ouvre sa fiche.
- **Affichage** (bouton) : Tâches avec heure (sur la grille à leur heure, sinon dans la rangée de la journée), Habitudes, Tâches terminées, Week-ends, Numéros de semaine. En dessous, la **liste des agendas** partagée avec Réglages › Agendas, qui lie vers tous les réglages.
- **Ajouter une tâche** : toucher un créneau vide de la grille (Jour, 3 jours) ouvre l'ajout rapide avec la date et l'heure préremplies (la demi-heure touchée, arrondie vers le bas). « Ajouter une tâche ce jour » existe aussi.
- **Tâches à planifier** : un tiroir « À planifier · glisser dans la journée » : glissez une tâche dans la grille, elle prend la date et l'heure déposées (« Déposer à 15:00 »), avec « Annuler ». Tirer le bord d'un bloc règle sa durée.
- **Événements de l'appareil** : toucher en ouvre la fiche (titre, heure, agenda, lieu avec **« Ouvrir dans Maps »** et **« Copier l'adresse »**, « Rejoindre » pour une visio, **« Ouvrir dans l'agenda »** pour l'événement complet dans l'application système). **« Masquer ici »** cache un événement dans Cadence seulement : rien n'est écrit chez le fournisseur, un message « Événement masqué ici » propose d'annuler, et on les rétablit dans Réglages › Agendas. L'événement masqué disparaît aussi de Tâches et du widget.
- **Réglages › Agendas** : pour chaque agenda, « Utiliser dans Cadence » (par défaut : ceux synchronisés sur l'appareil), puis des puces **Agenda**, **Liste Tâches**, **Notifications** et **Cocher une fois passé** ; les agendas sont groupés par compte et ceux qui ne sont pas utilisés ne s'affichent nulle part. **« Cocher une fois passé »** montre un événement terminé comme fait, sans rien écrire ; la liste se met à jour chaque minute.
- Un événement porté par deux agendas (même titre, même début et même fin, agendas différents) n'est montré qu'une fois, sur l'agenda principal du compte.
- **Google** : « Connecter Google » dans Réglages › Agendas (voir plus haut).
- Les tâches de Cadence qui ont une heure sonnent comme décrit dans [Notifications et rappels](Notifications-et-rappels).

Voir aussi [Android](Android).

## Cas particuliers

| Situation | Ce qui se passe |
|---|---|
| Un flux iCal ne répond plus | Dernière copie en cache, erreur dans l'onglet Calendriers |
| Vous masquez un calendrier Google | Il disparaît du Calendrier, d'Aujourd'hui, du plan et du brouillon IA |
| Vous supprimez un événement « Cadence » dans Google | La tâche perd sa date et reste |
| Vous supprimez une tâche Google | La tâche Cadence passe à « Fait » |
| L'heure change (été, hiver) | Une tâche récurrente avec heure garde son heure locale |
| Hors ligne | Le calendrier web est lisible depuis le cache ; vos modifications attendent la reconnexion (voir [Hors ligne et synchronisation](Hors-ligne-et-synchronisation)) |

## Raccourcis

| Touche | Action |
|---|---|
| `g` puis `c` | Aller au Calendrier |
| `Ctrl+K` | Palette de commandes : « Aller à Calendrier » |

## Pour aller plus loin

- [Plan du jour et calendrier](https://github.com/PreciselyWrong/cadence/blob/main/docs/20-daily-plan.md)
- [Synchronisation Google](https://github.com/PreciselyWrong/cadence/blob/main/docs/33-google-sync.md)
- [Synchronisation CalDAV](https://github.com/PreciselyWrong/cadence/blob/main/docs/11-caldav-sync.md)
- [Tâches récurrentes](https://github.com/PreciselyWrong/cadence/blob/main/docs/01-recurring-tasks-behavior.md)
- [Notes UX web](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/WEB-UX-NOTES.md)
- [Refonte Android](https://github.com/PreciselyWrong/cadence/blob/main/android/docs/REDESIGN.md)
