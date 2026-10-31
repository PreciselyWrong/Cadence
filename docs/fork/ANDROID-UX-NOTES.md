# Notes UX Android → web

Journal des décisions d'interface prises sur l'app Android, pour que le web les reprenne. Pendant de `WEB-UX-NOTES.md` (web → Android). Une entrée par changement : ce qui n'allait pas, ce qui a été décidé, ce que le web doit reprendre. Le comportement compte, pas le code Kotlin.

## Journal

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
