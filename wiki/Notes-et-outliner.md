# Notes et outliner

Les notes gardent ce que vous voulez conserver (comptes rendus, idées, références) ; les notes et les descriptions de tâches s'écrivent par défaut comme un **plan** (outliner, façon Workflowy ou Logseq), au clavier d'abord, en Markdown ordinaire. Cette page couvre les notes, l'éditeur en plan, les liens entre notes, tâches et personnes, les rétroliens et les liens de contact (téléphones, e-mails).

![Notes](images/web/notes.png)

## Les notes

Une note a un titre (facultatif, « Note sans titre » sinon), un contenu en Markdown, un projet facultatif, des étiquettes, une couleur de fond (10 teintes ou aucune) et, sur le web, une image d'arrière-plan facultative (menu ⋮ › **Arrière-plan**, les mêmes photos que Profil › Apparence, avec le crédit du photographe en coin). Pas de date, de priorité ni d'état : une note est une information.

**Créer** : bouton **Nouvelle note** de la page Notes, touche `n` sur la page Notes, depuis l'Inbox, ou depuis un projet (la note est alors rattachée au projet). Une note jamais saisie n'est pas créée.

**Ouvrir** : il n'y a pas de mode lecture séparé : une note s'ouvre directement dans l'éditeur. **Enregistrement automatique** une seconde après la dernière frappe (statuts Enregistré, Enregistrement..., Modifications non enregistrées) ; **Échap** enregistre tout de suite et laisse la note ouverte ; changer de note enregistre d'abord celle qu'on quitte, et ce que vous tapez pendant un enregistrement n'est jamais écrasé par la réponse du serveur.

**Le panneau Notes** : une liste (titre, début du contenu, date de modification) ; la page `/notes` montre une **vue d'ensemble** en **Liste** (cartes de texte) ou **Galerie** (cartes avec image : la première image de la note, sinon l'aperçu d'une adresse qu'elle contient, sinon le début du texte, plus le titre et jusqu'à trois étiquettes). Le choix est gardé pour votre compte. **Toutes les notes** dans le menu ⋮ d'une note renvoie à cette vue d'ensemble. Aucune note ne s'ouvre d'elle-même.

**Mode concentration** : un bouton agrandit la note en plein écran sans barre latérale ni liste ; **Échap** ou la croix en sort.

**Épingler** (menu ⋮ › **Épingler à la barre latérale**), **supprimer** (menu ⋮ › Supprimer, avec confirmation et **sans annulation** : la note et ses fichiers disparaissent, le projet et les étiquettes restent), **image ou fichier** (coller, glisser, ou `/` › **Image ou fichier** : un fichier suit l'accès de la note ; une nouvelle note doit d'abord avoir un titre ou du texte).

**Partage public** (web et Android) : l'icône globe (ou **Partager publiquement** dans le menu ⋯ d'Android) crée un lien « Toute personne disposant du lien » en lecture seule, que vous pouvez couper, regénérer (l'ancien lien cesse de marcher) ou relancer (même lien). Le lecteur ne voit que le titre, le contenu et la date. Voir [Auto-hébergement](Auto-hebergement) si le serveur a désactivé ce drapeau.

## L'éditeur en plan

Une seule surface : l'éditeur des notes. Les touches du plan passent avant celles du Markdown et ne font rien hors d'une liste (sauf Entrée sur une ligne de prose). **Rien ne change dans le stockage** : le texte reste du Markdown (listes `- `, retrait de 2 espaces), donc lu tel quel par Android et par les rétroliens. Aucune migration : une note en prose s'affiche comme avant et n'est pas réécrite à l'ouverture.

| Touche | Effet |
|---|---|
| Entrée | Coupe la puce au curseur : le texte après devient la puce suivante et garde les enfants. En fin de puce : nouvelle sœur (ou premier enfant si la puce est dépliée avec des enfants). En début de puce : une puce vide au-dessus. Une puce vide en retrait remonte d'un niveau ; au premier niveau, elle quitte la liste |
| Maj+Entrée | Retour à la ligne dans la même puce |
| Tab / Maj+Tab | Retrait / sortie de la puce **avec ses enfants** (Maj+Tab la place juste après son parent ; les sœurs qui la suivaient restent sous le parent, comme Workflowy) |
| Retour arrière au début du texte | Retire d'abord la case ; supprime une puce vide ; fusionne une puce sans enfants avec la ligne du dessus ; sans effet sur une puce qui a des enfants |
| Alt+↑ / Alt+↓ | Échange la puce et ses enfants avec sa sœur du dessus / du dessous |
| Ctrl/⌘+↑ / Ctrl/⌘+↓ | Replie / déplie la puce |
| Ctrl/⌘+. / Ctrl/⌘+, | Zoom sur la puce / remonte d'un niveau |
| Ctrl/⌘+Entrée | Case : aucune, puis `[ ]`, puis `[x]`, puis `[ ]` ; une ligne simple devient `- [ ]` |
| Ctrl/⌘+Maj+T (ou Alt+Maj+T) | Fait de la puce une **tâche liée** (voir plus bas). Les navigateurs gardent souvent Ctrl+Maj+T pour rouvrir un onglet : Alt+Maj+T et le menu de la puce marchent partout |

**Saisie** : taper sur une ligne vide hors liste commence une puce. Les débuts de blocs Markdown (`#`, `>`, `|`, `` ` ``, `-`, `*`, `+`) ne sont pas touchés : titres, citations, tableaux et code s'écrivent comme avant. **Entrée sur une ligne de prose** la transforme en puce et ouvre la suivante : c'est le seul moment où une prose existante devient une puce.

**Puces** : un point rond ; un clic sur le point **zoome**, un clic droit sur le point ou la case ouvre le menu **Puce** : Zoomer, Replier / Déplier, **Créer une tâche**.

**Repli** : un chevron à gauche (au survol, toujours visible pour une puce repliée) ; une puce repliée se lit « ... ». Elle reste repliée quand on la déplace.
- **Mémorisé** par lecteur et par navigateur (`localStorage`), partagé entre l'éditeur et la lecture ; une puce est reconnue par son texte et son rang parmi les puces de même texte : renommer une puce repliée la déplie à la visite suivante. En navigation privée (stockage refusé), le repli ne dure que la visite. Rien n'est synchronisé entre appareils.

**Zoom** : seule la puce et ses enfants restent visibles, la puce sert de titre, avec un fil d'Ariane « Tout › parents » pour remonter. Rien hors de la puce ne peut changer. Entrée sur le titre ajoute un premier enfant. Le zoom ne dure que la visite.

**Lecture** : là où l'on lit une note ou une description (panneau de tâche, mode concentration, fenêtre de note), le même plan s'affiche avec ses chevrons, son point qui zoome et ses cases cochables, qui écrivent au bon endroit même zoomé. Les cartes, la page publique et le blog gardent des listes simples.

### Puce en tâche liée

Ctrl/⌘+Maj+T (ou **Créer une tâche** du menu de la puce) :
- crée une tâche nommée d'après le texte de la puce sans Markdown (255 caractères au plus) ;
- dans le **projet de la note** (ou de la tâche dont c'est la description), sinon sans projet ;
- **remplace** le texte de la puce par `[[task:Nom]]` (la case est gardée) : le nom n'apparaît qu'une fois, la tâche liste la note dans ses rétroliens. Si la création échoue, un message le dit et la puce reste un lien vers une tâche à créer.
- Une case `- [ ] ...` devient `- [ ] [[task:Nom]]`.

**Case liée** : en lecture, la case d'une puce qui commence par `[[task:Nom]]` **suit l'état de la tâche** (cochée si elle est terminée ou archivée) ; un clic **termine ou rouvre la tâche**. Le texte de la note n'est jamais réécrit (le `[ ]`/`[x]` écrit peut donc différer de ce qu'on voit). Dans l'éditeur, la case reste celle du texte.

## La barre de mise en forme

Notes et descriptions de tâches s'éditent dans le **même éditeur**. La description d'une tâche s'ouvre au clic et s'enregistre quand le focus quitte l'éditeur, sa barre et ses menus.

Une **barre fixe en bas de l'éditeur** (elle reste collée en bas) : gras (Ctrl/⌘+B), italique (Ctrl/⌘+I), barré (Ctrl/⌘+Maj+X), titre (cycle H1, H2, H3, texte ; Ctrl/⌘+1/2/3), listes à puces, numérotée, à cases, citation, code (Ctrl/⌘+E : en ligne sur une ligne, bloc sur plusieurs), lien (Ctrl/⌘+K), `[[ ]]` (choix de note), `@` (choix de personne), tableau (grille lignes x colonnes ; le curseur dans un tableau ajoute « Ajouter / Supprimer une ligne, une colonne »). Sélectionner du texte affiche aussi une barre flottante.

Taper `/` en début de ligne ou après un espace ouvre le **menu des commandes** : titres, styles, bloc de code, citation, tâche, listes, séparateur, lien, lien de note, encadrés (NOTE, TIP, WARNING, IMPORTANT, DANGER), tableau, diagramme Mermaid, date du jour, **Image ou fichier**.

**Rendu** : Markdown complet (GFM) rendu en direct pendant la frappe (la source d'une ligne réapparaît quand le curseur y entre) : titres, gras, italique, barré, listes, cases cliquables, tableaux, code coloré, citations et encadrés `> [!NOTE]`, images et vidéos, liens, adresses nues, diagrammes Mermaid. **Sécurité** : le HTML brut n'est jamais interprété (affiché comme texte) ; seuls `http`, `https`, `mailto`, `tel` et les chemins relatifs passent ; un lien web externe s'ouvre dans un nouvel onglet (dans le client Linux, dans le navigateur par défaut) ; un lien vers une page de l'app reste dans l'app.

## Liens entre notes, tâches et personnes

| Vous écrivez | Il pointe vers | Rendu |
|---|---|---|
| `[[Titre]]` | La note de ce titre (casse ignorée) | Puce « Note : Titre » |
| `[[task:Nom]]` | La tâche de ce nom (une ouverte d'abord, puis la plus récente) | Puce « Tâche : Nom » |
| `@[Nom](person:<identifiant>)` | La personne | Puce `@Nom` vers sa fiche |
| `[texte](/note/<id>)`, `/task/<id>`, `/person/<id>` | L'élément de cet identifiant | Lien dans l'app |

- **Insérer** : taper `[[` ouvre la recherche de notes ; quand aucune note n'a le titre tapé, le menu propose **Créer la note « ... »** et la lie en une étape. Taper `@` en début de mot ouvre la liste des personnes (flèches, Entrée ou Tab, Échap) ; le choix s'enregistre sous la forme `@[Nom](person:...)`. Un `@` au milieu d'un mot (adresse e-mail) n'ouvre rien.
- **Cible inconnue** : une puce estompée « + ». Un clic crée la note (et l'ouvre) ou la tâche (et ouvre son panneau). Refermer à la main un `[[Titre]]` ou Ctrl/⌘-cliquer un lien de note inexistant demande aussi s'il faut la créer (Entrée crée, Échap ignore). Message : « Aucune note nommée « Titre » pour l'instant. La créer ? »
- **Ouvrir** : Ctrl/⌘-clic sur un lien dans l'éditeur ; un simple clic en lecture.
- **Dans le code** (en ligne ou en bloc), rien n'est un lien.
- Les noms de `[[task:...]]` sont résolus parmi les tâches que vous pouvez ouvrir (100 noms au plus par page).
- Une **page publique** ne montre que les notes publiques liées ; une tâche ou une mention y reste une puce sans lien, et un lien vers une note privée affiche un cadenas.

### Rétroliens

Sous une note, dans le panneau d'une tâche et sur la fiche d'une personne, une section **Rétroliens** liste les notes et tâches qui pointent vers l'élément (de la plus récemment modifiée à la plus ancienne, 100 au plus), avec un extrait de la phrase. Elle n'apparaît que s'il y en a.
- **Calculés à la lecture**, sans table : renommer, modifier ou supprimer une source se voit tout de suite, quel que soit le chemin d'écriture (web, MCP, synchro, TODO.md).
- Seules les sources que vous pouvez ouvrir sont listées (partages directs, de groupe et de projet compris). Une note qui se cite elle-même n'est pas listée.
- **Android** : rétroliens d'une note et d'une tâche, lus en ligne à l'ouverture (absents hors ligne) ; ceux d'une **personne** restent sur le web (Android n'a pas de fiche de personne ; une mention s'y lit en puce sans s'ouvrir).

## Liens de contact : téléphones et e-mails

Dans le rendu Markdown (notes, notes de tâches, aperçu de la description d'un événement), un **numéro de téléphone** devient un lien `tel:` et une **adresse e-mail** un lien `mailto:`.

| Écrit | Devient |
|---|---|
| `+41 79 123 45 67`, `+33 6 12 34 56 78` | Lien `tel:` (international : 8 à 15 chiffres, séparateurs espace, point, tiret, parenthèses) |
| `079 123 45 67` | Lien `tel:` (national à 10 chiffres commençant par 0) |
| `camille@example.com` | Lien `mailto:` |
| `2026`, `14h30`, `12.11.2026` | **Jamais** un lien : les dates, les heures et les années ne sont pas détectées |
| Un numéro déjà dans un lien ou dans du code | Laissé tel quel |

**Android** : les titres et notes des tâches, et les titres de notes, ouvrent les adresses reconnues au toucher (y compris des domaines avec traits d'union typographiques et des adresses suivies de caractères invisibles) ; un bouton de modification garde leur texte éditable. Les notes conservent leurs liens Markdown.

## Sur Android

- **Édition en plan** : même stockage, mêmes règles de texte que le web (un port Kotlin avec les mêmes cas de test). Le clavier du téléphone n'envoie que du texte ; l'app y reconnaît Entrée, le retour arrière au début d'une puce et la frappe sur une ligne vide.
- **Barre au-dessus du clavier** : sortir du retrait, décaler, monter, descendre, replier / déplier, zoomer, case, **Créer une tâche**, puis la mise en forme (le tableau se choisit par tailles toutes faites, de 2 x 2 à 4 x 3, sans ajout de ligne ni de colonne).
- **Lecture** : un chevron devant chaque puce repliable, « ... » qui déplie, un point qui zoome (fil d'Ariane), des cases qui écrivent au bon endroit même zoomé. Le repli est mémorisé **par appareil**, jamais synchronisé.
- **Case liée** : suit la tâche de ce nom **sur l'appareil** (hors ligne) et la termine ou la rouvre ; sans tâche de ce nom, c'est une case ordinaire.
- **Liens** : `[[Titre]]` ouvre la note, `[[task:Nom]]` la tâche, une cible inconnue est une puce « + » qui crée l'élément par la file d'envoi. Le choix **@** lit les personnes en ligne à la première ouverture et garde la dernière liste sur l'appareil pour écrire une mention hors ligne.
- **Hors ligne** : les notes sont synchronisées dans les deux sens (titre, contenu, couleur, épingle, projet, étiquettes) ; la saisie est enregistrée en différé et fusionnée sans effacer ce qui a été tapé depuis. Une suppression de note est annulable pendant environ 4,5 secondes.

## Cas limites

- **Suppression d'une note** : définitive, aucune corbeille. Une note qui se lie à elle-même n'a pas de rétrolien.
- **Une note qui n'a pas de titre** n'est pas enregistrée tant qu'il n'y a ni titre ni texte (utile pour les fichiers).
- **Collaborateurs** : seul le propriétaire d'une note peut la partager publiquement.
- Le plan fonctionne aussi hors d'une liste : tant qu'aucune puce n'existe, l'éditeur se comporte comme un éditeur Markdown classique.

## Pour aller plus loin

- [Notes (doc)](https://github.com/PreciselyWrong/cadence/blob/main/docs/05-notes-system.md), [Markdown, liens et rétroliens (doc)](https://github.com/PreciselyWrong/cadence/blob/main/docs/44-notes-links.md), [Plan, outliner (doc)](https://github.com/PreciselyWrong/cadence/blob/main/docs/45-outliner.md)
- Pages du wiki : [Taches](Taches), [Personnes et proches](Personnes-et-proches), [Android](Android), [Hors-ligne et synchronisation](Hors-ligne-et-synchronisation)
