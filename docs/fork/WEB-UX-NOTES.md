# Notes UX web → Android

Journal des décisions et corrections d'interface faites sur le web, pour que l'agent Android les reprenne. Une entrée par changement : ce qui n'allait pas, ce qui a été décidé, ce que l'app doit reprendre. Le comportement compte, pas le code React. Les jetons visuels (couleurs, rayons, typo) restent dans `DESIGN-TOKENS.md`.

## Cap

Interface directe, très claire, sans encombrement. Références de comportement : Things 3, TickTick, Todoist (jamais leur code, leurs ressources ni leurs textes).

- Une information n'apparaît qu'une fois par écran ; pas de métadonnée répétée sur chaque ligne si l'en-tête la porte déjà.
- Aucun bouton sans effet visible : un contrôle qui ne fait rien est retiré, pas laissé.
- Le contenu suit la largeur disponible ; jamais de défilement horizontal involontaire.

## Journal

### 2026-11-12 — Style d'Aujourd'hui sur tout le bureau, passe de soustraction (web)

- **Problème** : seules Aujourd'hui et Planifier suivaient la refonte ; les autres pages gardaient un fond gris, un titre maigre (`text-2xl font-light`), des contrôles refaits à la main, des lignes à liseré coloré et des compteurs « 0 tasks · 0 notes · 0 projects ».
- **Socle** : surface neutre unique derrière toutes les pages (`bg-surface`, plus de gris autour du contenu) ; en-tête commun `Shared/ui/PageHeader.tsx` (titre 800, une seule rangée d'actions à droite qui passe à la ligne sans chevaucher, ligne de résumé facultative, filtres dessous) ; ligne commune `Shared/ui/ListRow.tsx` (deux niveaux comme une ligne de tâche : titre, puis le contexte en gris ; clic = ouvrir ; ⋯ au survol ou au focus, au clic droit, toujours visible au toucher, et chaque action existe aussi sur la page de l'élément) ; champ de filtre `Shared/ui/SearchField.tsx`.
- **Étiquettes** : lignes simples ; la couleur de l'étiquette est le seul signal (point de 6 px, ou son icône teintée) ; usages sans les zéros (« 5 tâches · 2 notes », rien si inutilisée) ; tri par utilité : épinglées, puis les plus utilisées (sous-arbre compris), puis le nom ; plus de groupes par lettre.
- **Projets** : liste par défaut (la galerie reste au choix) ; une ligne = icône du projet dans sa couleur (seule couleur), nom, puis domaine · statut seulement s'il dit autre chose qu'« actif » (ni « Non commencé » ni « En cours ») · échéance · prochaine action ; nombre de tâches ouvertes à droite s'il est non nul ; plus de tableau, de barre d'avancement, d'avatars ni de pastille de statut colorée (aussi retirée des cartes) ; statut, partage, modèle et suppression dans le ⋯ ; tri par défaut : dernière activité ; filtres sous le titre.
- **Zones** : mêmes lignes (point de la couleur de la zone, nom, puis « 3 projets · 2 objectifs · 12 tâches » sans les zéros, accordés au pluriel : clés `counts.*`) ; tri et « Suggérer 5 domaines » dans l'en-tête ; description de la zone seulement sur sa page.
- **Inbox** : en-tête commun (« À trier (n) » en bouton discret, plus d'aplat ambre ; « Trier ») ; champ de saisie sur une surface neutre bordée d'un filet, sans ombre ; « Tâches à classer » en lignes comme une tâche (titre, lieu en gris, « Quand ? » en boutons neutres), cinq d'abord puis « Tout afficher » ; « Récemment capturé · n » en en-tête de section comme Aujourd'hui. Deux gestes par idée : clic = ouvrir le tri (Tâche · Liens · Note · Projet en boutons neutres, plus de texte coloré par choix), touche Suppr = supprimer ; la croix qui n'apparaissait qu'au survol est retirée (Supprimer reste dans le panneau).
- **Une seule fiche de tâche** : sur toutes les pages (Inbox, projets, étiquettes, revue, recherche…), une tâche s'ouvre dans la même fiche flottante qu'Aujourd'hui et Planifier (large, sur le bas de la page, « Agrandir » la met en pleine page) ; un clic dehors, Échap ou un second clic sur la même ligne la ferme ; plus de panneau étroit à droite ni de colonne réservée. Tout ce qui ouvrait une tâche par son identifiant (notifications, liens, recherche, Tâches à classer) passe par cette fiche ; le dialogue ne reste que pour une occurrence isolée d'une série et sur les pages tâche et habitude. Bouton de ligne « Ouvrir le détail ».
- **Liens** : la vue liste devient une vraie liste (plus une grille de cartes) : vignette 40 px (case neutre sans image), titre, une ligne de description, puis domaine · statistiques GitHub · date de revue · projet · étiquettes en gris ; la note seulement une fois écrite (« Ajouter une note » passe dans le ⋯) ; recherche, filtres et « Archivés » sous le titre, en champs pleins sans bordure. La galerie reste au choix. Le ⋯ commun (`OverflowMenu`) prend l'apparence du menu du design system (bouton nu, menu sur la surface).
- **Personnes** : en-tête commun, filtres Tous / Membres / Contacts en sélecteur segmenté (`Shared/ui/Segmented.tsx`, le même que Jours | Horizons de Planifier ; nombre seulement s'il est non nul) ; une ligne = point de couleur, nom, puis rôle · e-mail · archivé en gris ; plus de groupes par lettre ni de liseré.
- **Habitudes** : en-tête commun, « N sur M faites » en ligne de résumé, Habitudes / Archivées en sélecteur segmenté, titres de groupe en en-tête de section discret ; cartes inchangées (déjà neutres, couleur au prorata).
- **À trier** : en-tête commun (« N à voir » en résumé) ; la carte sur une surface basse bordée d'un filet ; boutons du design system (principal plein, autres neutres).
- **Revue** : en-tête commun ; « Revue rapide » devient le bouton principal de l'en-tête (la carte d'invitation disparaît, son texte passe en info-bulle) ; les étapes en sélecteur segmenté sous le titre, nombre seulement s'il est non nul.
- **Notes (vue d'ensemble)** : en-tête commun ; la vue liste devient une liste de lignes (`Shared/NoteRow.tsx` : point de couleur de la note ou icône, titre, puis la première ligne écrite sans Markdown · projet) au lieu d'une grille de cartes de 280 px ; la galerie reste au choix. L'éditeur et l'en-tête de la note ne changent pas ici (refonte de l'éditeur en cours ailleurs).
- **Calendrier** : en-tête commun (« Calendrier » + mois en sous-titre), vues en sélecteur segmenté, impression, options, ‹ Aujourd'hui › en boutons du design system ; la grille et les blocs ne changent pas encore (blocs pastel façon Aujourd'hui à reprendre).
- **Réglages (Profil)** : en-tête commun ; plus de cartes ombrées autour de la navigation et du formulaire (surface unique) ; navigation à gauche en lignes neutres, la rubrique ouverte en surface haute au lieu du bleu.
- **Page projet et page étiquette** : titre 800 comme les autres pages ; plus de carte teintée de la couleur derrière l'en-tête (la couleur reste sur l'icône) ; boutons d'action du design system ; la jauge d'avancement (barre + grand pourcentage) devient une ligne de texte « N tâches sur M terminées · X % du temps écoulé » sur le projet et disparaît sur l'étiquette (une étiquette n'est pas un objectif). Notes du projet en lignes (`NoteRow`, ⋯ Modifier / Supprimer) ; la carte de note (`NoteCard`, liseré bleu) est retirée.
- **Lignes de tâches (toutes les listes)** : un seul signal de couleur : une priorité haute est la case rouge ; le drapeau de priorité reste comme raccourci mais en gris.
- **À reprendre sur Android** : Étiquettes triées pareil (épinglées, puis usage décroissant) ; page projet : avancement en une ligne de texte, sans barre ; Liens : « Ajouter une note » dans le ⋯ plutôt qu'une ligne vide par lien ; Inbox : « Tâches à classer » limitée à cinq lignes puis « Tout afficher » ; Projets : statut seulement hors « actif », tâches ouvertes à droite, tri par dernière activité par défaut ; le reste (lignes simples, pas de « 0 », pas de barre) est déjà fait par la passe du 2026-11-02.

### 2026-11-12 — Notes et descriptions : barre de mise en forme en bas, mentions @ (web)

- **Problème** : la mise en forme ne passait que par une barre flottante sur sélection (notes) ou la syntaxe tapée à la main ; la description d'une tâche était un simple champ texte, sans `[[`, sans tableau ; aucune façon de citer une personne.
- **Décision** : la description d'une tâche s'édite dans l'éditeur des notes ; une barre fixe en bas de l'éditeur remplace la barre flottante : gras, italique, barré, titre (cycle), listes à puces / numérotée / à cases, citation, code, lien, `[[ ]]`, `@`, tableau (grille lignes × colonnes, puis ajouter / supprimer ligne et colonne quand le curseur y est). `@` ouvre la liste des personnes, le choix s'enregistre `@[Nom](person:uid)` et se lit en puce vers la fiche ; la fiche d'une personne liste les notes et tâches qui la mentionnent. Doc : `docs/44-notes-links.md`.
- **À reprendre sur Android** : même barre sous l'éditeur des notes et descriptions (mêmes transformations de texte), même choix `@` et même jeton, section Rétroliens de la fiche personne.

### 2026-11-12 — Notes et descriptions : Markdown complet, liens et rétroliens (web)

- **Problème** : `[[Titre]]` vers une note introuvable n'affichait qu'une puce morte ; aucune façon de lier une tâche ou une personne ; les liens web s'ouvraient dans l'onglet de l'app ; les rétroliens existaient dans l'API (notes seules) sans être affichés.
- **Décision** : un seul rendu Markdown (GFM complet) pour notes et descriptions ; `[[Titre]]` (note), `[[task:Nom]]` (tâche), `@[Nom](person:uid)` (personne) en puces ; cible inconnue = puce estompée « + » qui crée l'élément ; lien web = nouvel onglet ; lien vers une page de l'app = reste dans l'app. Section « Rétroliens » en bas de la note, du panneau de tâche et de la fiche personne, cachée s'il n'y en a pas (titre, extrait ; clic = ouvrir). Doc : `docs/44-notes-links.md`.
- **À reprendre sur Android** : même syntaxe et mêmes puces dans le rendu des notes et descriptions, même création d'une cible inconnue, section Rétroliens depuis `GET /api/note|task|people/:uid/backlinks`.

### 2026-11-12 — Horizons déduits de la date ; « Tâches à classer » sans les tâches prévues

- **Problème** : une tâche prévue un jour ou à échéance dans le mois n'apparaissait dans aucun horizon tant qu'on ne l'y glissait pas ; une tâche de « Ce mois-ci » ne revenait jamais se faire planifier ; une tâche prévue aujourd'hui restait dans « Tâches à classer ».
- **Décision** : sans engagement qui tient (`week_of` de cette semaine, `month_of` de ce mois ou du suivant), une tâche prend l'horizon de sa première ligne de plan à partir du début de la semaine, sinon de son échéance à partir d'aujourd'hui (hors récurrentes) ; rien n'est écrit. Une tâche prévue un jour de cette semaine reste sous « Prévues un jour » de Cette semaine. Règle : `docs/03-upcoming-view.md`. « Tâches à classer » : une ligne de plan aujourd'hui ou plus tard est un quand décidé ; une ligne passée non ; dès le 1er de son mois, une tâche de `month_of` revient à planifier (`docs/41-auto-classify.md`).
- **À reprendre sur Android** : `TaskViews.unsorted` doit exclure les tâches prévues aujourd'hui ou plus tard et ramener celles de `month_of` dès le 1er du mois (avec `month_of` dans Room) ; mêmes horizons déduits quand Planifier sera repris.

### 2026-11-12 — Un lien seul dans la saisie : la fiche du partage (web)

- **Problème** : sur le web, une adresse collée seule (ou partagée vers la PWA) n'avait que Boîte de réception / Tâche / Note / Projet : « Tâche » prenait l'adresse brute pour nom, « Liens » n'existait pas (il fallait passer par l'Inbox puis ouvrir l'idée), « Projet » n'a pas de sens pour une adresse. Une tâche née d'un lien proposait encore « + Ajouter aux liens » sous sa description, comme si le lien n'existait pas.
- **Décision** : quand le texte n'est qu'une adresse (au plus des `#étiquettes` et un `+projet`, une ligne, sans fichier), « Ajouter à » propose **Boîte de réception · Tâche · Liens · Note** ; Boîte de réception reste le choix par défaut (Entrée = l'idée attend dans l'Inbox). Aperçu de la page sous le texte, étiquettes et projet comme d'habitude. **Tâche** : nom = titre de la page (aperçu déjà lu, sinon 3 s d'attente au plus), sinon le domaine ; note = l'adresse. **Liens** : le lien est gardé tout de suite (titre, étiquettes, projet, sans source ni idée), ligne « « titre » enregistré dans les liens. » avec Annuler (supprime le lien). Dès qu'un mot s'ajoute à l'adresse, les quatre choix habituels reviennent et un choix Liens retombe sur Boîte de réception. Sous la description d'une tâche ou d'une note, une adresse déjà dans les liens s'affiche « ✓ Dans les liens · domaine » d'emblée.
- **À reprendre sur Android** :
  1. Ajout rapide (`QuickAddSheet`, « + » des widgets) : pour un texte qui n'est qu'une adresse (même règle : `#`, `+` permis, une ligne, sans pièce jointe), proposer les choix de la fiche de partage (Inbox par défaut, Tâche, Liens, Note ; pas de Projet). Tâche : même règle de nom (`IdeaTasks`), adresse en note. Liens : `POST /api/links` en appel différé avec titre, étiquettes et projet, sans `source_type` ; Annuler supprime le lien. Vérif : coller `https://exemple.org/page #lecture`, choisir Liens : le lien apparaît dans Liens avec l'étiquette, rien dans l'Inbox ; ajouter un mot : le choix Liens disparaît.
  2. `AddToLinksRow` (`ui/AddToLinks.kt`) : afficher « Dans les liens · domaine » pour une adresse déjà dans la table Room `links` (comparaison : hôte en minuscules, chemin sans `/` final, sans fragment), pas seulement après un toucher. Vérif : « Créer une tâche » depuis un lien, ouvrir la tâche : la ligne dit « Dans les liens ».
  3. Retirer les chaînes mortes des anciennes décisions (`links_action_to_evaluate`, `links_action_tested`, …, `strings_links.xml`) si plus rien ne les lit.
  4. Revérifier sur le téléphone l'étape 5 de la revue du 2026-11-07 (décision écrite tout de suite, annulation réelle ; livrée en 1.13.0) : tuer l'app pendant le toast d'annulation, la décision reste.

### 2026-11-12 — Web hors ligne : pastille d'état (web, client Linux)

- **Problème** : sans serveur, le web montrait des pages vides ou des erreurs, et une modification faite hors ligne ne s'affichait pas ; dans le client Linux, rien ne disait que le serveur était injoignable.
- **Décision** : le web marche hors ligne (`docs/fork/WEB-OFFLINE.md`) ; une modification s'affiche tout de suite ; une petite pastille en bas à droite n'apparaît que s'il y a quelque chose à savoir : « Hors ligne », « Hors ligne · N en attente », « Envoi des modifications (N) », « Non enregistrées : N » (liste et raison, « OK »), « Conflits : N » (ouvre Profil › Synchronisation). Rien quand tout est envoyé.
- **À reprendre sur Android** : l'app est déjà hors ligne ; vérifier qu'elle dit aussi, sans bandeau permanent, quand des modifications attendent ou ont été refusées.

### 2026-11-12 — Aujourd'hui refait, barre latérale bleu nuit (web)

- **Problème** : la colonne de gauche ne montrait que les candidates (« Nothing here » avec 8 tâches prévues), cinq représentations du plan, deux navigations de date, un glisser dans le calendrier qui réécrivait l'échéance, des actions qui surgissaient au survol.
- **Décision** : une liste du jour (prévues + dues ce jour, une fois chacune), lignes à deux niveaux (heure, titre, puces projet / étiquettes / durée → fin / échéance), calendrier 1, 3 ou 7 jours à droite ; glisser = créneau, jamais l'échéance ; réordonner les tâches à heure réordonne la journée ; clic = détail sous la page ; menu au clic droit ; rien au survol. Barre latérale bleu nuit (anthracite en sombre), épinglés en tuiles, mini-mois. Doc : `docs/20-daily-plan.md`, `docs/fork/TODAY-REDESIGN.md`.
- **À reprendre sur Android** : mêmes membres du jour (`GET /api/daily-plan/day`), écriture du plan par `PATCH` d'opérations, reporter = déplacer la ligne du plan, durée par ligne de plan, réordonner = recaler les créneaux, couleurs de blocs par projet ; le reste (mise en page) adapté au tactile.

### 2026-11-07 — Inbox : un seul panneau de tri ; Liens : la bibliothèque (web)

- **Problème** : un lien partagé partait tout seul dans Liens ; dans l'Inbox, sa carte proposait cinq décisions de lien (Garder, À tester, Projet, Plus tard, Jeter) à côté du « Enregistrer comme » habituel, plus un mode « Trier les liens » à part : impossible d'y mettre une étiquette, un projet ou d'en faire une tâche simplement.
- **Décision (Inbox)** : un lien partagé est une idée avec un aperçu. Ligne fermée : l'aperçu (titre, une ligne de description, domaine, vignette) remplace l'adresse brute ; le texte reste seulement s'il dit plus que l'adresse. Ouverte, la même carte pour toute idée : le texte modifiable, l'aperçu s'il y a une adresse (lu par `GET /api/url/title`, aucun lien n'existe encore), une ligne étiquettes (champ avec les étiquettes fréquentes en puces, un clic chacune) et projet (liste « Projet »), puis « Enregistrer comme : Tâche · Liens · Note » et « Supprimer » à droite. « Liens » n'existe qu'avec une adresse ; « Projet » seulement sans adresse. L'idée quitte l'Inbox dès la décision prise (toast ; « Supprimer » garde son annulation).
- **Règle de la tâche** : nom = titre de la page s'il est connu, sinon le texte sans l'adresse, sinon le domaine (sans `www.`) ; note = l'adresse, puis le reste du texte s'il n'a pas servi de nom. Étiquettes et projet choisis s'ajoutent à ceux écrits dans le texte (`#`, `+`) ; le projet choisi l'emporte.
- **Liens** : `POST /api/links` (titre de la page, texte sans l'adresse en note, étiquettes, projet, source = l'idée), puis `process { link_uid }`. Le projet du Focus n'est pas appliqué à un lien.
- **Tri au clavier** : mêmes décisions : T tâche, L liens (avec adresse, suggérée pour une adresse seule), N note, P projet (sans adresse), S « Plus tard » (passe l'idée pour ce tri seulement), Suppr. Le mode « Trier les liens » disparaît.
- **Page Liens** : liste par défaut (galerie toujours au choix) ; filtres : recherche, étiquette, projet, bouton « Archivés » (montre seulement l'archive). Carte : titre (ouvre la page), description, domaine, note, étiquettes, projet, ⋯ = Modifier, Créer une tâche (même règle de nom, note = adresse + note du lien, le lien ne change pas), Archiver ou Désarchiver, Supprimer (confirmation). Plus de liste de statuts, de badge de type ni d'extrait de README.
- **À reprendre sur Android** : le même panneau (aperçu, étiquettes, projet, Tâche / Liens / Note / Supprimer), la même règle de nom, Projet absent pour une adresse, la page Liens à quatre filtres et le menu ⋯ à quatre entrées.

### 2026-11-07 — Liens : seulement ceux qui portent une action (web et Android)

- **Problème** : la bibliothèque de liens se remplissait de chaque adresse écrite dans une tâche ou une note (serveur maison, boîte mail, recherche, fil LinkedIn, run de CI) : du bruit.
- **Décision** : seule l'Inbox crée des liens, jamais pour une adresse de contexte. Sous la description d'une tâche (panneau) et sous l'éditeur d'une note, une ligne discrète « + Ajouter aux liens · domaine » par adresse (trois au plus sur Android, cinq sur le web) ; touchée, elle devient « ✓ Dans les liens · domaine ». Rien ne s'affiche sans adresse ni en lecture seule. Les anciens liens jamais touchés venus des tâches et des notes sont supprimés une fois.
- **Android** : fait dans la même étape (`ui/AddToLinks.kt`, sous les aperçus de lien de la fiche de tâche et de la note).

### 2026-11-06 — Bannière de projet (web et Android)

- **Problème** : l'image d'un projet n'apparaissait qu'en vignette de 56 px dans l'en-tête, et elle remplaçait l'icône et la couleur partout : une fois l'image posée, la liste des projets perdait ses repères. Android ne la recevait pas.
- **Décision** : la photo devient une bannière pleine largeur en haut de la page projet (112 px sur téléphone, 176 px sur grand écran), sans texte par-dessus ; le carré de l'en-tête et les lignes de la liste gardent toujours l'icône colorée. Le carré ouvre toujours le choix de l'image. Sans image, rien ne change.
- **Android** : fait dans la même étape (`ui/ProjectBanner.kt`) : bannière de 140 dp entre les actions et le titre, en lecture seule ; rien ne s'affiche si l'image ne se charge pas. La clé d'API n'accompagne que les chemins du serveur (`model/ProjectImage.kt`).

### 2026-11-04 — Bilan du soir (web)

- **Problème** : après la journée, le résumé du matin ne répond plus à la question utile : qu'est-ce qui est fait, qu'est-ce qui reste ce soir, qu'est-ce qui glisse, et que vaut demain.
- **Décision** : à partir de `evening.switchTime` (heure du profil, 18:00 par défaut ; réglage `Profil › Résumé › Bilan du soir`, désactivable), `/insights/daily-brief` et la carte d'Aujourd'hui montrent le bilan. Lien discret « Voir le résumé du matin » (et « Voir le bilan du soir » pour revenir). Ordre : verdict et trois compteurs (faites, ce soir, glissées) ; « Ce soir » (ce qui reste de la liste du matin) ; « Fait aujourd'hui » ; « Glisse » (dues ou prévues aujourd'hui, non retenues pour ce soir, avec la raison) ; « Demain » (une journée de la frise).
- **Ligne de tâche** : le cercle de fin change l'état tout de suite (la ligne reste à sa place, barrée ou non, avec le toast d'annulation). Les lignes « Ce soir » et « Glisse » ont « Reporter à demain » : la tâche rejoint le plan de demain, sans changer sa date ; le toast « Annuler » la retire de ce plan, sauf si elle y était déjà (rien n'est ajouté, pas d'annulation).
- **États** : chargement = squelette ; erreur = une phrase ; listes vides = une phrase (« Plus rien à faire ce soir. », « Rien ne glisse. »).
- **Réglages** : bloc « Bilan du soir » sous « Génération » (case et heure de passage, pas de 5 minutes).
- **À reprendre sur Android** : le même découpage (verdict, trois compteurs, quatre sections dans cet ordre), l'heure de passage lue dans le fuseau du profil, le lien entre les deux vues, « Reporter à demain » avec son annulation par retrait du plan de demain, et le réglage. Contrat : `docs/39-daily-brief.md`, section « Evening review ».

### 2026-11-04 — Résumé du jour (web)

- **Problème** : l'ancien Daily Brief était un bloc IA unique (focus, actions, pièges) sans heure, sans charge et sans moyen de dire « non » ; sa carte d'aujourd'hui n'existait pas.
- **Décision** : `/insights/daily-brief` affiche le résumé dans l'ordre des sections des réglages (`sections`), sans tout remonter : verdict et deux compteurs en tête ; une frise de trois jours (axe 8 h à 22 h) avec travail en gris, soir en encadré (remplissage = déjà prévu), réunions en barres sombres, conflit en rouge, texte seulement sous la frise (« 40 / 90 min », « 15 min de trop » en gras quand c'est dépassé) ; puis Ce soir, À déplacer, À anticiper, Réponses attendues, Inbox, Réglé. Une ligne de tâche garde le cercle de fin (annulable par toast), montre l'état actuel de la tâche et ouvre son panneau au clic.
- **Déplacer** : la pastille de date accepte la proposition (la date de la tâche change, annulable) ; « Pas cette date » la refuse pour ce jour. Rien ne bouge sans ce geste.
- **Questions** : Oui / Non / Préciser (texte) écrivent un contexte lié ; « Utile » / « Bruit » sont des boutons texte discrets, pas des icônes.
- **Pas de bouton sans effet** : pas d'action « Brouillon » ni « Créer une tâche » pour les mails tant que la phase de rédaction n'existe pas ; « Source non lue » s'affiche à la place quand la source mail n'est pas lue.
- **États** : vide = une phrase et « Générer maintenant » ; échec = message court et « Régénérer » (le résumé précédent reste visible) ; chargement = squelette.
- **Aujourd'hui** : une carte compacte (date, verdict, deux compteurs, « Voir le résumé ») quand Aujourd'hui affiche le résumé (réglage `today_settings.showDailyBrief`, posé dans Profil › Résumé).
- **Réglages** : Profil › Résumé (état des sources et fuseau en tête, puis génération, sections, calendriers, soir et charge, arbitrage, alertes, rédaction, conservation, voix, options) ; Profil › Agents (adresse, clé masquée au dernier 4 caractères, délai, profils, règles de tri, « Tester la connexion »).
- **Contexte** : le panneau d'une tâche liste ses contextes liés (modifier, supprimer) ; rien quand il n'y en a aucun.
- **À reprendre sur Android** : la frise (mêmes bandes, mêmes libellés de charge, conflit rouge), l'ordre et le masquage des sections selon les réglages, la pastille de date qui déplace la tâche et « Pas cette date », les questions Oui / Non / Préciser, « Utile » / « Bruit », les trois états vide / échec / chargement, le bloc « Contexte » du panneau de tâche, et les réglages Résumé et Agents (même découpage de sections). Pas de « Écouter » tant que l'audio n'est pas prêt (phase 4).

### 2026-11-01 — Passe d'épure : liste des tâches

- **Problème** : l'en-tête de « Toutes les tâches » (et des listes Demain, À venir…) gardait un bouton « i » bleu qui dépliait une phrase d'explication.
- **Décision** : bouton et bandeau retirés ; l'en-tête garde recherche et tri.
- **Android** : repris dans la même étape : les sous-titres d'explication « Résultats clés et liste d'envies » (Objectifs) et « Les plus récentes d'abord » (Terminées) disparaissent ; « 7 prochains jours » (À venir) reste, il dit la période montrée.

### 2026-11-01 — Passe d'épure : Boîte et panneau de tâche

- **Problème** : la Boîte avait un bouton « i » qui ouvrait un bandeau répétant l'aide déjà affichée sous le champ, une grande icône décorative dans la carte de capture et deux lignes d'aide permanentes (« Entrée enregistre… », « #étiquette +projet… ») ; le panneau d'une tâche simple montrait une puce « Étiquettes » vide, un titre « Sous-tâches » au-dessus du seul champ d'ajout et un titre « Commentaires » avec une zone de saisie et un bouton « Commenter » ouverts en permanence.
- **Décision** : plus de bouton « i » ni de bandeau, plus d'icône décorative ; les deux lignes d'aide apparaissent dès qu'on écrit. Panneau : la puce Étiquettes rejoint « Plus » tant qu'il n'y en a pas (date et projet restent) ; pas de titre « Sous-tâches » sans sous-tâche ; sans commentaire, un seul bouton discret « Commenter » ouvre la zone de saisie, et le titre « Commentaires » n'apparaît qu'avec un commentaire.
- **Android** : repris dans la même étape : la fiche n'a plus sa liste de 7 lignes toujours remplies de « Aucune » ; une valeur déjà lue sur un badge du haut n'est plus répétée en ligne, Dates et Projet restent même vides, les autres champs vides attendent « Plus de champs » (`DetailFieldRules`) ; pas de titre « Sous-tâches » sans sous-tâche. L'Inbox Android n'a déjà qu'un champ « Capturer une idée… » sans aide permanente ; Android n'écrit pas de commentaires.

### 2026-11-01 — Passe d'épure : page projet

- **Problème** (projet de 2 tâches, rien de rempli) : « Démarré le 29 oct. », une barre « 0 tâches sur 2 terminées 0 % », un bouton « Partager » à côté de « Terminer », un panneau « Infos du projet » de 7 lignes toutes vides (« Définir un domaine », « Aucune date de début »…), deux panneaux « Aucune note pour l'instant » et « Aucun fichier pour l'instant… », et « Terminé (0) ».
- **Décision** : une date de début passée ne s'affiche plus (« Commence le » reste pour une date à venir) ; la barre d'avancement attend une première tâche faite (ou des dates de début et d'échéance) ; « Partager » rejoint « Épingler » dans « … » ; le panneau d'infos ne montre que les champs remplis, « Ajouter un détail » dévoile les autres ; Notes et Pièces jointes vides n'ont plus que leur titre et « + » ; une section « Terminé (0) » ne s'affiche pas (toutes les listes).
- **Android** : rien à reprendre : l'en-tête de projet n'a ni date de début, ni barre, ni partage, ni panneau d'infos, et la section des terminées n'apparaît déjà que non vide. Le statut reste visible des deux côtés (c'est son seul accès).

### 2026-11-01 — Passe d'épure : navigation

- **Problème** : la barre latérale affichait sept compteurs permanents (Aujourd'hui, Demain, 7 prochains jours, Boîte, Projets 6, Zones 1, Étiquettes 9) ; la barre du haut gardait le mot « Focus » même sans focus et une touche « C » collée au bouton Capturer.
- **Décision** : par défaut, seuls Aujourd'hui et la Boîte gardent un compte (ce qui attend une action) ; Demain, 7 prochains jours et les en-têtes de section n'en ont plus (Profil › Barre latérale pour les rallumer ; un choix déjà enregistré est gardé). « Focus » sans portée est une icône (le mot reste pour les lecteurs d'écran, il apparaît dès qu'une portée est choisie) ; le raccourci de Capturer reste dans l'info-bulle.
- **Android** : repris dans la même étape : l'onglet « À venir » et l'onglet « Notes » perdent leur compteur (seul « Aujourd'hui » garde le sien), les sous-titres « N étiquettes » et « N notes » sont retirés. Le sous-titre des Projets (« N actifs · N dans le stash ») reste, comme sur le web.

### 2026-11-01 — Passe d'épure : Aujourd'hui

- **Problème** : un jour vide s'ouvrait sur la jauge « 0 min planifiées sur 7 h libres » et sur le grand guide « Démarrer la journée, étape 1 sur 3 » (même avec « Rien ne reste d'hier ») ; chaque ligne répétait « Échéance aujourd'hui » sous la page Aujourd'hui et « 30 min », la durée par défaut, sur toutes les tâches ; le « + » d'ajout au plan restait visible sur chaque ligne.
- **Décision** : la jauge n'apparaît qu'une fois une tâche planifiée ; le guide ne s'ouvre plus de lui-même (« … › Démarrer la journée ») ; une ligne due aujourd'hui n'a plus de sous-ligne, une durée ne s'affiche que si la tâche en porte une (estimation, début→fin ou choix fait sur la ligne) ; à la souris, le « + » apparaît au survol ou au focus clavier (toujours visible au toucher).
- **Android** : repris dans la même étape : jauge de charge seulement si une tâche est planifiée, plus de compteur de retard dans le résumé de la carte du matin (« N à replanifier »), plus de compteur dans les en-têtes « Aujourd'hui » et « Demain » (le compte est déjà sur l'onglet). La carte du matin reste une ligne refermable : pas de grand guide à retirer côté Android.

### 2026-11-01 — Page Objectifs : un seul écran, comme Android

- **Problème** : `/goals` séparait Objectifs et Liste d'envies en onglets ; un objectif n'était qu'une ligne (titre, « pourquoi ») sans avancement à 375 px, sans résultats clés ni prochain pas ; tri, filtre par domaine et glisser-déposer chargeaient l'écran ; « Créer une tâche » d'une envie était caché dans un menu « … » ; une envie réalisée restait dans son groupe sans le dire sur téléphone.
- **Décision** : même écran qu'Android. Recherche (titre ou note, sans accents), objectifs actifs en cartes (%, horizon et échéance, barre, « Prochain pas » avec sa case, sinon « Ajouter un prochain pas », résultats clés « titre … 3/10 »), « En pause, atteints ou abandonnés » replié, puis la liste d'envies Avoir / Être / Faire repliable (ligne : case « Réalisée » avec Annuler, titre vers sa page, prochain pas, bouton « Créer une tâche » toujours visible), un champ « Ajouter une envie… » au bas du groupe ouvert, « Réalisées » à part. Le tri, le filtre par domaine et l'ordre personnalisé quittent cette page (l'API `/api/goals/order` reste). L'API ajoute `next_task` à chaque but de `GET /api/goals`.
- **Android** : repris dans la même étape (onglet Objectifs des Tâches et écran du Bilan).

### 2026-11-01 — Revue : « Revue rapide », une chose à la fois

- **Problème** (vu avec 133 idées dans « Plus tard », 4 repoussées, 2 projets stagnants) : six onglets à compteurs (« Plus tard 133 » se lisait comme une dette), rien ne disait par où commencer, chaque ligne de « Plus tard » portait quatre puces (des centaines de décisions à l'écran), le nom du projet répété sous chaque ligne d'un groupe déjà nommé, l'onglet restait vide pendant le chargement, pas de clavier ; le stock « Plus tard » n'était jamais relu sauf tri volontaire.
- **Décision** : en tête de `/review`, une carte « Revue rapide — environ 5 minutes, une chose à la fois » et « Commencer ». File de 10 éléments au plus : Inbox, repoussées, projets stagnants, revues arrivées, anciennes, puis les idées de « Plus tard » regardées il y a le plus longtemps, avec au moins 3 places pour elles. Un élément à la fois, ses choix habituels numérotés, « Passer » (n'écrit rien, revient une autre fois), « 3 sur 10 » et une barre fine, jamais la taille du stock ; fin : « C'est tout pour cette fois. », « Encore un tour » sans ce qui a été passé. Dans la session, « Garder de côté » est à un geste pour une idée de « Plus tard » (elle repart au bout de la file). Clavier : 1–9 choisit, S ou → passe, O ouvre, Échap arrête (aussi dans « Trier un par un »). En-tête calme comme Android (« 5 choses à regarder, à votre rythme » / « Tout est à jour »), sans « décidées cette semaine » ; l'onglet « Plus tard » ne compte que les revues arrivées ; « Chargement… » pendant la lecture ; plus de projet répété dans un groupe.
- **Android** : repris dans la même étape (carte « Revue rapide » au-dessus des onglets, écran plein une chose à la fois, même file et mêmes tests, onglet « Plus tard » compté de la même façon). Pas de clavier sur le téléphone.

### 2026-11-01 — Profil › MCP : « Autoriser un nouveau connecteur »

- **Problème** : claude.ai pouvait enregistrer un connecteur à tout moment, sans geste de l'utilisateur dans Cadence.
- **Décision** : quand le serveur a une URL MCP publique, Profil › MCP montre une carte « Connecter claude.ai » avec l'URL à ajouter et un bouton « Autoriser un nouveau connecteur » ; il ouvre une fenêtre de 10 minutes et la carte dit jusqu'à quelle heure Cadence attend. Refus expliqués sur place : double authentification à activer d'abord, ou compte non autorisé. Carte absente sans URL publique.
- **À reprendre sur Android** : rien ; l'app n'a pas de réglages MCP ni de clés d'API, et l'appairage se fait depuis le web sur Tailscale.

### 2026-11-01 — Boîte : « Trier les liens » sur le web

- **Problème** : sur le web, un lien de la boîte se décidait carte par carte, sans mode pour les parcourir l'un après l'autre.
- **Décision** : à partir de deux liens dans la boîte, « Trier les liens (n) » ouvre un lien à la fois, pleine largeur, avec les quatre décisions (Garder, Tester, Plus tard, Jeter) et « Passer » (le lien repart au bout de la file). Un lien décidé quitte la boîte et la file ; « Retour à la boîte » sort du mode.
- **À reprendre sur Android** : rien de nouveau ; le mode existe déjà (« Trier les liens »). Vérifier que le web et Android partagent les quatre décisions et l'ordre de « Passer ».

### 2026-11-01 — Recherche : liens ; `[[titre]]` entre notes

- **Problème** : la recherche globale ne cherchait pas les liens (filtre « Liens » absent, un clic sur un lien ne faisait rien) ; un `[[titre]]` affichait « Note not found » sur les pages qui ne chargeaient pas la liste des notes.
- **Décision** : la recherche couvre les liens sans filtre et propose le filtre « Liens » ; un clic ouvre l'adresse du lien dans un nouvel onglet. Un `[[titre]]` ouvre la note de même titre, sans tenir compte de la casse ni des espaces autour ; la liste des notes se charge au besoin. Un titre inconnu reste « Note not found ».
- **À reprendre sur Android** : la recherche des liens et le filtre « Liens » existent ; vérifier qu'un `[[titre]]` ouvre la note de même titre sans casse.

### 2026-11-01 — Revue : puces au lieu du menu « Décider », Annuler, Trier un par un

- **Problème** : chaque ligne de `/review` ouvrait un menu « Décider » ; une décision était définitive ; « Plus tard » ne se parcourait qu'en liste.
- **Décision** : les choix d'une ligne sont des puces à un geste (trois au plus, puis « Plus… ») ; rouge retiré, « Abandonner » est une puce neutre. Une décision enregistrée affiche « Décision enregistrée » avec **Annuler**, qui remet la ligne et rétablit les champs modifiés (En vue, Cette semaine, Plus tard, date de revue, statut). Pas d'annulation pour « Faire aujourd'hui » ni « Passer en session courte » : elles touchent le plan de la journée. « Trier un par un » sur « Plus tard » montre une tâche à la fois avec les mêmes choix et « Passer » (la tâche passée repart au bout).
- **À reprendre sur Android** : Android a déjà le balayage, l'annulation et « Trier un par un » ; vérifier que les mêmes décisions sont annulables et que « Plus… » reprend les choix masqués.

### 2026-11-01 — Aujourd'hui : en-tête réduit, description sous le titre

- **Problème** : l'en-tête d'Aujourd'hui gardait quatre boutons en permanence (Tout placer, Clore la journée, IA, Calendrier) ; « Tout placer » apparaissait même sans tâche à placer.
- **Décision** : « Tout placer » seulement s'il reste une tâche non placée ; « Clore la journée » le soir (à partir de 18 h) ou dès qu'une tâche est faite (ou quand le bilan est ouvert) ; « Rédiger avec l'IA » passe dans « … » (même choix « Compléter / Recommencer »). « Calendrier » reste visible.
- **Décision** : option « Afficher la description sous le titre » (désactivée par défaut, par appareil) dans Apparence ; deux lignes de la note en texte brut sous le titre de chaque ligne de tâche.
- **À reprendre sur Android** : mêmes règles d'en-tête (Tout placer conditionnel ; Clore la journée le soir ou si une tâche est faite ; IA dans « … »). La description sous le titre existe déjà côté Android (`RowDisplayStore`).

### 2026-11-01 — Cartes de projet : statut par défaut et avancement

- **Problème** : chaque carte de projet affichait « En cours » et une barre `0/1` ou `0/0`, du bruit sur un état attendu.
- **Décision** : le statut par défaut (« En cours ») n'a plus d'étiquette, seule l'icône reste cliquable (« Changer le statut »). L'avancement n'apparaît qu'à partir de deux tâches, en ligne discrète (texte gris, barre fine et grise).
- **À reprendre sur Android** : même règle sur la carte projet (statut par défaut sans étiquette ; avancement seulement si au moins deux tâches, style discret).

### 2026-11-01 — Revue : « Plus tard » groupé, liens en carte

- **Problème** : `/review` montrait l'URL brute d'une tâche ou d'une idée qui n'est qu'un lien, et « Plus tard » était une liste plate de 50 lignes.
- **Décision** : une ligne dont le titre (ou l'idée) est une adresse montre la carte de son lien enregistré (titre, description, domaine, type, étoiles), sans la note. « Plus tard » charge 200 lignes, groupées par projet, puis domaine, puis « Sans projet », triées par dernière activité, groupes pliables avec leur nombre (au-delà de 20, seul le premier est ouvert), filtre en tête. « Faire aujourd'hui » (la ressort de Plus tard) et « Terminer » rejoignent les choix de Plus tard.
- **Android** : repris dans la même étape, avec en plus le balayage, les choix d'un toucher et « Trier un par un ».

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

### 2026-11-01 — Ordonner et copier les habitudes

- **Problème** : l'ordre des habitudes d'un moment de la journée ne se changeait pas, et refaire une habitude semblable demandait de tout ressaisir.
- **Décision** : le menu « ⋯ » de chaque carte propose « Monter », « Descendre » (dans son groupe, selon l'ordre affiché) et « Dupliquer ». La copie garde le groupe, la cible, les montants rapides, les rappels et le type de l'habitude, démarre aujourd'hui sans historique, et se place à la fin du groupe. L'ordre s'écrit par `sort_order` via `PATCH /api/cadence/habits/:uid` ; le groupe est renuméroté 0..n pour qu'une égalité ne masque pas un échange. Logique : `frontend/utils/habitOrder.ts`, `duplicateHabit` dans `frontend/utils/cadenceHabitSave.ts`.
- **Android** : à reprendre. Même menu sur les lignes d'habitude, même écriture de `sort_order`. Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Un événement d'agenda ICS s'ouvre en fiche

- **Problème** : cliquer un événement d'un agenda ICS ne faisait rien : son lieu, sa description et sa fin étaient perdus à l'import.
- **Décision** : la fiche en lecture seule affiche l'heure (ou « Toute la journée »), l'agenda, le lieu (lien vers Maps, copie, « Rejoindre » pour un lien de réunion) et la description telle quelle. Le serveur garde lieu et description pour la page Calendrier seulement ; la vue du jour (Aujourd'hui, brouillon IA) n'en reçoit pas. Logique : `frontend/components/Calendar/FeedEventPopover.tsx`, `backend/modules/calendar-feeds/icsEvents.js`.
- **Android** : à reprendre. Même fiche en lecture seule pour les événements d'agenda ICS. Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Recherche : texte trouvé en couleur, liens inclus

- **Problème** : dans Ctrl+K, rien ne montrait pourquoi une ligne correspondait, et les liens n'étaient pas cherchés.
- **Décision** : chaque mot tapé est mis en gras et en bleu dans le titre des résultats, sans tenir compte de la casse. Les liens entrent dans la recherche, sous « Liens » ; un lien s'ouvre à son adresse dans un nouvel onglet. Logique : `frontend/utils/highlightMatches.ts`, `frontend/components/CommandPalette/CommandPalette.tsx`.
- **Android** : à reprendre. Même mise en évidence dans la recherche, et les liens dans la recherche globale. Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Webhooks : note créée, lien enregistré

- **Problème** : un assistant qui classe les nouveaux éléments (Hermès, profil `capture`) n'apprenait que les nouvelles tâches.
- **Décision** : deux cases de plus dans le groupe « Changes » de la carte Webhooks (Profil → Notifications) : « Note created » et « Link saved » (`note.created`, `link.created`). Logique : `backend/modules/webhooks/captureEvents.js`, `frontend/utils/webhooksService.ts`.
- **Android** : rien à reprendre. Les webhooks se règlent sur le web seulement.

### 2026-11-01 — En-tête de Projets : un tri et des réglages en moins

- **Problème** : l'en-tête des Projets comptait sept contrôles (recherche, cartes/liste, tri, réglages, « … », nouveau) ; le tri et les réglages (projets « someday » et terminés) servaient rarement.
- **Décision** : restent visibles la recherche, le choix cartes/liste, « … » et « Nouveau projet ». Le tri (cinq choix, coché) et les deux interrupteurs de réglages passent dans le menu « … », après lesquels viennent Historique, Depuis un modèle et Importer. Le menu se ferme au choix, interrupteurs compris. Le point bleu du réglage modifié disparaît avec le bouton réglages ; l'état reste visible dans le menu (coche).
- **Android à reprendre** : tri et deux réglages (projets someday et terminés) dans le menu de la barre d'outils, pas en boutons à part ; coche sur le choix actif.

### 2026-11-01 — Projet TODO.md d'un dépôt git : état de synchro

- **Problème** : un projet lu depuis un dépôt Gitea/GitHub peut ne pas être à jour, ou une modification faite dans Cadence peut ne pas avoir atteint le dépôt ; rien ne le montrait.
- **Décision** : sous le titre d'un projet `git:<slug>`, une ligne discrète « Synchronisé avec <dépôt> · il y a 3 minutes ». Si une modification n'a pas pu être poussée : « Conflit : « Fix bug » a changé dans le dépôt, rien n'a été écrit. » ou « N modification(s) en attente : le dépôt est injoignable. », en ambre, avec « Réessayer » et « Abandonner ». Visible du seul compte propriétaire des projets TODO.md. Logique : `frontend/components/Project/TodoMdRepoSync.tsx`, `GET /api/todo-md/status` (`repos`), `POST /api/todo-md/repos/<slug>/retry|discard`.
- **Android à reprendre** : même ligne d'état sur l'en-tête d'un projet `git:` (lire `/api/todo-md/status`, pas par la synchro), mêmes boutons ; un ajout ou une case refusé(e) en `todo_md_conflict` / `todo_md_repo_unreachable` doit l'afficher au lieu d'un échec muet. Reste : rien d'essayé.

### 2026-11-01 — Page Synchronisation et conflits sur le web

- **Problème** : les conflits restaient dans `sync_conflicts` sans que le web ne les montre ; seul le téléphone listait les siens (Réglages › Synchronisation).
- **Décision** : Réglages › Synchronisation (groupe Intégrations). Une carte « Appareils » : chaque appareil qui a déjà synchronisé (clé API utilisée, non révoquée), « Synchronisé il y a 2 heures », puis la dernière modification connue du serveur ; une ligne « N modifications faites hors ligne dans ce navigateur attendent d'être envoyées » seulement s'il y en a. La carte « Conflits » n'apparaît que s'il y en a : « Tâche · « Appeler Paul » · Titre », « Écartée : … », « Gardée : … », puis « Garder cette valeur » / « Garder l'autre » ; pour une habitude, « Compris » seul. Seul le dernier conflit d'un champ est montré ; un conflit déjà réglé ailleurs (la ligne a pris la valeur) ou dont la ligne est supprimée disparaît. Logique : `frontend/components/Profile/tabs/SyncTab.tsx`, `GET /api/sync/status`, `POST /api/sync/conflicts/:id/resolve`.
- **Android à reprendre** : la liste du téléphone ne montre que les conflits perdus par le téléphone lui-même. Lire aussi `GET /sync/status` pour les conflits perdus par les autres appareils (mêmes deux boutons, réglés côté serveur), et afficher la liste des appareils avec leur dernière synchro. Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Mode Dense : mêmes règles d'épure

- **Problème** : le mode Dense n'avait pas été revu avec les règles du 2026-11-01. Revue (code, Dense) d'Aujourd'hui, Boîte, Tâches, Projets et page projet : les lignes de tâche Dense suivaient déjà la règle « date passée sans rouge », la Boîte et Projets n'ont rien de propre au Dense, et chaque liste n'a qu'un moyen d'ajouter (bouton « Ajouter » de la page projet en Dense, pas de ligne en plus). Restaient : l'échéance passée en rouge gras dans l'en-tête de la page projet ; « Épingler » en bouton visible à côté de « Terminer » et « Partager » ; dans « Parcourir » d'Aujourd'hui, une pastille « Boîte 0 » et des pastilles « Tout 0 ».
- **Décision** : l'échéance passée de l'en-tête de projet s'écrit « Échéance 20 sept. » dans la couleur du texte ; « Épingler / Épinglé » passe dans le menu « … » de l'en-tête à toutes les largeurs (restent visibles Terminer, Partager, « … ») ; dans « Parcourir », aucune pastille ne montre 0 (la pastille Boîte n'existe que si la boîte contient quelque chose, sauf si elle est le filtre choisi). Rien de propre au Dense n'est retiré (onglets, compteurs de commentaires, sous-tâches, ligne de détails). Logique : `frontend/components/Project/ProjectHero.tsx`, `frontend/components/DailyPlan/CandidateList.tsx`.
- **Android à reprendre** : en-tête d'un projet : échéance passée en date neutre, épingler dans le menu de la barre d'outils ; filtres d'Aujourd'hui : jamais de compteur 0, pas de filtre Boîte quand elle est vide.

### 2026-11-01 — Vue Arborescence d'un projet

- **Problème** : saisir ou réorganiser une liste de tâches et de sous-tâches demandait d'ouvrir chaque tâche ; aucune vue ne montrait le projet comme un plan qu'on tape d'un trait.
- **Décision** : onglet « Arborescence » sur la page projet (Minimal et Dense), entre Tâches et Tableau. Chaque tâche est une ligne modifiable avec sa case, ses sous-tâches en retrait d'un niveau. Entrée : nouvelle ligne au même niveau (sous-tâche du même parent pour une sous-tâche) ; taper puis Entrée crée et ouvre la suivante ; Échap ou Retour arrière sur une ligne vide l'abandonne. Tab : devient sous-tâche de la tâche au-dessus ; Maj+Tab : redevient tâche, juste après son ancien parent ; un seul niveau (une tâche qui a des sous-tâches ne se décale pas). Alt+↑/↓ : déplace parmi ses sœurs (ordre personnalisé du projet ; pour les sous-tâches, toute la liste du parent est réécrite telle que le serveur la tient). ↑/↓ passent d'une ligne à l'autre ; quitter une ligne enregistre son nom. Un seul ajout : « + Ajouter une tâche » en bas, le bouton « Ajouter » de l'en-tête est masqué sur cet onglet. Une ligne d'aide discrète sous la liste. Lecture seule : rien de modifiable ; projet TODO.md : nouvelles lignes et cases seulement. Choix mémorisé par projet en Minimal (`ui_settings.viewTypes`, `outline`). Logique : `frontend/components/Project/ProjectOutline.tsx`, API de tâches existante (`parent_task_id`, `subtasks`, `PUT /api/tasks/order`).
- **Android à reprendre** : vue « Arborescence » d'un projet : lignes modifiables en place, sous-tâches en retrait, ajout en chaîne par la touche Entrée du clavier, retrait / sortie d'un niveau (boutons → / ← de la barre au-dessus du clavier, faute de Tab), déplacement par glisser ou boutons ↑/↓ de la même barre, case pour terminer. Par la synchro : `parent_task_uid` pour le niveau, `order` pour l'ordre des sous-tâches ; l'ordre personnalisé des tâches du projet (`user_task_orders`) n'est pas synchronisé aujourd'hui, à prévoir ou à remplacer par `order`. Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Galerie pour les Liens et les Notes

- **Problème** : les Liens n'existaient qu'en cartes chargées (description, chiffres GitHub, note, boutons) et les notes en cartes de texte ; rien ne permettait de parcourir d'un coup d'œil par l'image.
- **Décision** : bascule « Liste / Galerie » dans l'en-tête de `/links` et de la vue d'ensemble des notes, mémorisée pour le compte (`ui_settings.viewTypes`, clés `links` et `notes`, valeur `gallery`). Galerie : grille de 2 colonnes sur téléphone à 4 sur grand écran ; chaque carte montre l'image (lien : image de la page, sinon l'initiale du site ; note : sa première image, sinon l'image d'un lien trouvé dans la note, sinon le début de son texte sans Markdown), le titre sur deux lignes, le site (liens) et trois étiquettes au plus. Pas de boutons sur les cartes : un lien s'ouvre dans un nouvel onglet, une note s'ouvre dans l'éditeur ; le tri et les actions restent dans la vue Liste. En Galerie, `/notes` arrive toujours sur la grille (la dernière note ne s'ouvre plus d'elle-même) ; « Toutes les notes » dans le menu ⋮ d'une note ramène à la vue d'ensemble. Logique : `frontend/components/Shared/GalleryCard.tsx`, `frontend/components/Note/NoteGallery.tsx`, `frontend/utils/galleryPreview.ts`, `frontend/components/Links/LinksPage.tsx`.
- **Android à reprendre** : la galerie des Liens existe déjà (mémorisée sur l'appareil, avec les quatre décisions) ; y ajouter les étiquettes sur les cartes et, si possible, lire le choix dans `ui_settings.viewTypes.links` pour qu'il suive le compte. Notes : même bascule Liste / Galerie dans l'onglet Notes, mêmes règles d'image (première image de la note, sinon image d'un lien de la note, sinon début du texte). Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Un seul ordre des tâches d'un projet

- **Problème** : l'Arborescence du web rangeait les tâches d'un projet par un ordre propre à chaque compte (`user_task_orders`), non synchronisé, et suivait le tri choisi pour la liste ; Android range par `order`. Les deux clients pouvaient montrer deux ordres.
- **Décision** : l'ordre d'un projet est le `order` de ses tâches de premier niveau (synchronisé). Le tri Personnalisé de la liste et l'Arborescence le lisent et l'écrivent ; l'Arborescence le montre toujours, quel que soit le tri de la liste, et un déplacement (Alt+↑/↓, Tab, Maj+Tab) ne change plus ce tri. Tâches jamais rangées en tête, la plus récente d'abord. Un membre en lecture seule ne peut plus ranger un projet partagé (403). Logique : `backend/modules/tasks/order/service.js`, `frontend/components/Project/ProjectDetails.tsx`, `android/tasks/.../model/Outline.kt`.
- **Android à reprendre** : fait dans la même étape (Arborescence : tâches jamais rangées en tête, comme le web). Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Rattacher un lien à un projet

- **Problème** : Android range un lien dans un projet (« Rattacher » de la galerie des découvertes) ; le web n'offrait que Garder, Tester, Plus tard et Jeter.
- **Décision** : « Rattacher » s'ajoute aux décisions de la carte de lien de l'Inbox (entre Tester et Plus tard) et aux boutons des cartes de `/links` (vue Liste). Il ouvre le choix d'un projet (obligatoire, « Choisir un projet » tant que rien n'est choisi), puis « Créer la tâche » crée dans ce projet une tâche au nom du lien (titre, sinon domaine, sinon adresse), avec l'adresse puis la note en note de tâche, et met le lien à « Gardé ». Dans l'Inbox, l'idée est marquée traitée. Le bouton n'existe pas sans projet. Logique : `frontend/utils/linkTriage.ts`, `frontend/components/Links/LinkProjectPicker.tsx`, `LinkTriageActions.tsx`, `LinkCard.tsx`.
- **Android à reprendre** : fait (galerie des découvertes, puis carte de lien de l'Inbox, 2026-11-01). Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Calendrier, étape 4 de la refonte : Agenda d'Aujourd'hui et dépôt au quart d'heure

TickTick 8.0.20 n'a pas pu être observé en direct (accès refusé) : écarts relevés dans le code de Cadence et par rapport au comportement connu de TickTick, à revérifier sur l'app.

- **Problème** : dans le panneau Agenda d'Aujourd'hui, les tâches du plan sans heure ne se réordonnaient pas et ne pouvaient pas changer de jour (seuls le bac « sans heure » de la vue Jour et la liste le permettaient) ; une tâche planifiée déplacée à un autre jour depuis la page Calendrier ou la fiche restait au plan de l'ancien jour ; un glisser sur la grille de la semaine ou du jour tombait toujours à l'heure pile.
- **Décision** :
  - Agenda d'Aujourd'hui : les lignes sans heure du plan se glissent l'une sur l'autre (même ordre que le bac de la vue Jour, les tâches à heure gardent leur place) ; une ligne du plan non faite montre « Demain » et « Semaine prochaine » au survol ou au focus (toujours sur écran tactile), avec la même règle et la même annulation que le bac. Le glisser au clavier part du libellé « À tout moment », pour qu'Entrée sur la ligne ouvre toujours la tâche.
  - Une tâche due au plus tard un jour planifié (ou sans date) dont l'échéance passe après ce jour quitte le plan de ce jour, sur tous les chemins (Calendrier, fiche, Android, MCP), pour aujourd'hui et les jours suivants seulement ; les plans passés, les tâches faites et les tâches récurrentes ne bougent pas. Logique : `backend/modules/daily-plan/leaveOnMove.js` (hook du modèle).
  - Semaine et jour du Calendrier : le haut du bloc se pose là où il est lâché, par pas de 15 minutes, en tenant compte de l'endroit où il a été saisi. Logique : `frontend/components/Calendar/dropTime.ts`.
  - Pas d'ordre propre aux tâches sans heure dans la rangée « journée entière » du calendrier : l'ordre d'un jour est celui du plan, un seul.
- **Android à reprendre** : rien pour le dépôt au quart d'heure (l'agenda Android cale déjà sur 15 minutes) ni pour le départ du plan (règle du serveur, la synchro l'applique). Aujourd'hui sur Android lit le plan sans le modifier : réordonner les tâches sans heure et « Demain / Semaine prochaine » sur une tâche du plan viendront avec l'écriture du plan depuis le téléphone. Reste : rien d'essayé sur le téléphone ; comparaison avec TickTick à refaire sur l'app.

### 2026-11-02 — Exceptions des temps de concentration

- **Problème** : les temps de concentration (« … › Temps de concentration ») revenaient chaque semaine sans exception : pendant les vacances ou un jour de congé, ils bloquaient quand même le placement automatique. Le brouillon IA ne les voyait pas du tout. Sur Android, les plages protégées étaient gardées sur le téléphone seul, sans lien avec celles du web.
- **Décision** : une section « Exceptions » sous les blocs, dans la même fenêtre : premier et dernier jour (inclus), motif facultatif, et les blocs libérés (« Tous les blocs » par défaut ; le choix bloc par bloc apparaît dès deux blocs enregistrés). Comme une pause d'habitude : une période, pas une règle. Une exception passée disparaît d'elle-même. Le serveur décide quels blocs tiennent un jour (`focus_blocks_of_day`, `backend/modules/daily-plan/slots.js` `focusBlocksOn`) ; le brouillon IA les traite comme des réunions. Logique : `frontend/components/DailyPlan/FocusBlocksDialog.tsx`.
- **Android à reprendre** : fait dans la même étape (Réglages › Planification : plages et exceptions lues du serveur, envoyées après chaque modification, gardées « à envoyer » hors ligne ; `planning/FocusRepository.kt`). Reste : rien d'essayé sur le téléphone.

### 2026-11-02 — Épinglés en tête de la barre latérale

- **Problème** : les éléments épinglés (projets, notes, étiquettes) étaient dans une section « Signets » repliée par défaut, sous les listes intelligentes, en lignes grises comme le reste ; épingler un projet passait par le menu « … » de sa page. On ne les voyait pas, on n'y pensait pas.
- **Décision** : comme les listes épinglées de TickTick, un bloc « Épinglés » ouvre la barre latérale, au-dessus d'Aujourd'hui : fond teinté, toujours ouvert (plus de flèche), lignes en 14 px moyen avec l'icône du projet dans sa couleur, la pastille de l'étiquette ou l'icône de note ; la croix au survol désépingle. Chaque ligne de projet et d'étiquette de la barre a un bouton punaise au survol (toujours visible au toucher) qui épingle sans ouvrir. Dans Profil › Barre latérale, « Épinglés » a son interrupteur en tête mais ne se déplace plus. Logique : `frontend/components/Sidebar/SidebarBookmarks.tsx`, `frontend/components/Sidebar/sidebarPins.tsx`.
- **Android à reprendre** : fait dans la même étape (« Épinglés » en tête du sélecteur de listes, ouvert par le titre de Tâches : projets et notes épinglés, appui = ouvrir, appui long = désépingler ; `ui/ListSwitcherSheet.kt`). Les étiquettes épinglées n'y sont pas : `pinned` des étiquettes n'est pas gardé dans Room (inscrit dans `TODO.md`). Reste : rien d'essayé sur le téléphone.

### 2026-11-03 — Bouton « Tester » pour Ordinateur

- **Problème** : la colonne Ordinateur de Profil › Notifications n'avait pas de bouton « Tester » ; impossible de savoir si le poste Linux recevait quelque chose sans attendre un vrai rappel.
- **Décision** : la ligne « Envoyer une notification de test » a maintenant un bouton par colonne, Ordinateur compris. Le message dit que le test arrive sur l'ordinateur dans la minute si l'app Cadence tourne (le client interroge le serveur, rien n'est poussé). Logique : `frontend/components/Profile/tabs/NotificationsTab.tsx`, `backend/modules/notifications/service.js`.
- **Android à reprendre** : rien ; l'écran des réglages de notifications d'Android n'a pas de colonne par canal serveur.

### 2026-11-05 — Bilan du soir : quatre gestes sur chaque ligne, « Pas utile »

- **Problème** : au bilan du soir, reporter à demain était le seul geste sur une tâche ce soir ou glissée ; changer l'échéance, la mettre de côté ou l'abandonner passait par la fiche. Le vote « Bruit » sur une alerte ne disait pas ce qu'il changeait.
- **Décision** :
  - Chaque ligne « Ce soir » et « Glisse » a une case et un bouton « … » qui ouvre : Demain, Choisir une date, Plus tard, Abandonner. Le geste se voit tout de suite sur la ligne (« Demain », « Échéance : ven. 6 », « Plus tard », « Abandonnée » avec le titre barré), avec une annulation de 6 secondes qui rétablit la tâche et la ligne. Services existants : report au plan du lendemain, `updateTask` (échéance, statut), `decideTask` (`later`).
  - Vote d'alerte : « Utile · Pas utile » ; après « Pas utile », la carte dit « Tu verras moins ce type d’alerte ». Les votes stockés restent `useful` / `noise`.
  - Écart : annuler « Plus tard » retire l'étiquette #someday seulement. Le serveur a aussi retiré la tâche de la vue, de la semaine et du plan du jour ; l'annulation ne les rétablit pas.
- **Android à reprendre** : le même menu sur le bilan du soir et le libellé « Pas utile » ; rien d'essayé sur le téléphone.

### 2026-11-06 — Résumé : Priorités du jour et surcharge en heures

- **Problème** : la section « Ce soir » ne contenait pas que des tâches du soir, et « 525 min de trop » comparait tâches et événements à la seule capacité du soir.
- **Décision** : le titre devient « Priorités du jour » (le bilan du soir garde « Ce soir », clé `dailyBrief.evening.tonightTitle`) ; le libellé dit « Surcharge : 9 h 15 de tâches pour 1 h 30 de libre ». Le critère « long terme » disparaît des réglages.
- **Android à reprendre** : rien, fait dans la même étape.

### 2026-11-06 — Choisir le TODO.md d'un projet, projets mixtes

- **Problème** : chaque dossier créait son propre projet, verrouillé en entier : impossible de suivre un fichier dans un projet existant, ni d'y garder du marketing à côté.
- **Décision** : « Fichier TODO.md » dans « Informations du projet » (liste des fichiers, « Aucun » pour détacher, celui d'un autre projet grisé). Le menu « Ajouter à » du champ d'ajout rapide part sur « Cadence seulement » ; Now, Next et Ideas écrivent dans le fichier. Le verrou et le badge sont par tâche. Un projet lié se renomme.
- **Android à reprendre** : fait dans la même étape, dans le menu du projet ; le champ d'ajout reste sans section (l'étiquette `code` décide).

### 2026-11-06 — Liens : galerie par thèmes, statuts, import

- **Problème** : les liens restaient noyés dans l'Inbox, et la liste passait avant les aperçus.
- **Décision** : la galerie est la vue par défaut, groupée par thème (premier segment de la première étiquette). Statuts lisibles : À lire, À évaluer, À tester, Gardé, Plus tard, Archivé. « Tâche » crée une tâche en un clic, qui garde l'adresse. « Importer des favoris » lit un export Firefox dans le navigateur.
- **Android à reprendre** : même galerie et mêmes statuts, livrés dans la même étape, avec « Liens » dans Listes. L'import reste sur le web : c'est un geste unique, depuis l'ordinateur où est le fichier.

### 2026-11-06 — Tâches à heure fixe : à l'heure, réglage partagé

- **Problème** : le client Linux prévenait 24 h avant une tâche à heure fixe (« due dans 23 heures »), sans rien dire au bon moment.
- **Décision** : une tâche à heure fixe sonne à son heure, moins l'avance choisie ; plus d'alerte « bientôt due » pour elle. Carte **Tâches à heure fixe** dans Profil › Notifications, enregistrée aussitôt (`/api/notifications/timed-tasks`).
- **Android à reprendre** : fait dans la même étape : Réglages › Notifications lit et écrit le même réglage.

### 2026-11-06 — Liens : gérer un lien, un seul menu de statut

- **Problème** : impossible de supprimer un lien, d'en corriger le titre ou l'adresse, ou de le ranger dans un projet ; la rangée Tester, Garder, Plus tard, Jeter, Attach mêlait statuts et actions sans le dire.
- **Décision** : un menu de statut et un menu ⋯ (Modifier, Créer une tâche, Supprimer), aussi en galerie ; une fiche pour le titre, l'adresse, le projet, la note et les étiquettes ; un vrai projet sur le lien, avec un filtre. « Attach » disparaît.
- **Android à reprendre** : livré dans la même étape (1.12.3).

### 2026-11-06 — Frise du jour : tâches à heure déplaçables, liste plus courte

- **Problème** : une tâche à heure hors du plan restait figée dans la frise, son titre s'affichait deux fois, les blocs proches se recouvraient, l'aide passait sur les heures, et les suggestions automatiques noyaient le jour.
- **Décision** : le bloc se déplace et change l'heure de la tâche ; ce qui se chevauche passe côte à côte ; l'aide au-dessus de la grille ; suggestions repliées derrière « Suggérées n », routines d'un autre jour exclues.
- **Android à reprendre** : rien : Aujourd'hui n'y a ni frise déplaçable ni suggestions dans la liste.

### 2026-11-06 — Police web : Inter

- **Problème** : la police du web (Plus Jakarta Sans) ne plaisait pas.
- **Décision** : Inter, hébergée dans `public/fonts/`, découpée par alphabet.
- **Android à reprendre** : non demandé, Android garde Plus Jakarta Sans. À changer si l'écart gêne.

### 2026-11-06 — Aujourd'hui : ton ordre

- **Problème** : la liste du jour suivait un classement calculé, sans moyen de la ranger soi-même.
- **Décision** : glisser une tâche sur une autre ligne la met à sa place (`tasks.today_order`, synchronisé) ; ce qui est rangé à la main passe d'abord, le reste suit l'heure puis le classement.
- **Android à reprendre** : même champ et même ordre, avec Monter et Descendre dans le menu ; le glisser-déposer reste à faire (`TODO.md` › Now).

### 2026-11-06 — Aujourd'hui sert à faire

- **Problème** : 17 lignes d'un coup : le jour mêlé à ce qui est prévu pour la semaine ou mis en vue.
- **Décision** : la liste montre le jour ; Demain, Cette semaine, En vue et Suggérées sont repliées dessous, fermées à chaque visite. « Placer tout » ne prend que le jour.
- **Android à reprendre** : livré dans la même étape (1.12.4), sous la liste Aujourd'hui.

### 2026-11-06 — Frise du jour : étirer et déplacer

- **Problème** : impossible de changer la durée d'une tâche à heure ou de déplacer un événement d'agenda depuis la frise.
- **Décision** : le bas de chaque bloc devient une poignée (curseur flèche haut-bas, quart d'heure) ; les événements d'un agenda Google en deux sens se déplacent et s'étirent ; les autres restent fixes et le disent au survol.
- **Android à reprendre** : pas de frise déplaçable sur Android (`TODO.md` › Now).

### 2026-11-07 — Jeton du bot Telegram masqué

- **Problème** : le jeton du bot Telegram s'affichait en clair dans Profil › Telegram et voyageait en entier dans chaque réponse du profil.
- **Décision** : une fois enregistré, le champ montre `••••••••` et les 4 derniers caractères avec un bouton Effacer, comme la clé de l'assistant IA ; un nouveau jeton se tape dans un champ masqué.
- **Android à reprendre** : rien, Android n'a pas de réglage Telegram.

### 2026-11-07 — Classement automatique : cartes, mention, réglages

- **Problème** : le classement des nouveaux éléments vivait dans Hermes et posait ses questions sur Telegram, hors de Cadence.
- **Décision** : une carte par élément dans « À trier », trois rangées affichées seulement en cas de doute (Projet : options, Domaine, Nouveau projet prérempli, Autre…, Aucun ; Tags à cocher et un nouveau tag décoché ; Priorité), les meilleures réponses précochées pour qu'« Appliquer » d'emblée vaille « Tout accepter » ; doublon de lien : quatre choix, rien jeté sans un toucher. Sur une tâche, une note ou un lien : « Classé automatiquement · Annuler » tant qu'il n'a pas été modifié. Profil › Classement : tous les réglages, un essai à blanc, les passes récentes avec annulation.
- **Android à reprendre** : livré dans la même étape (cartes, notifications à boutons, mention, Réglages › Classement).


### 2026-11-08 — Classement automatique : erreur d'API visible

- **Problème** : un appel à l'IA refusé (clé fausse, modèle inconnu) ne se voyait que dans les logs du serveur ; les éléments en échec restaient perdus.
- **Décision** : bandeau rouge en tête de Profil › Classement, avec la dernière erreur (statut : message, date) tant qu'aucun appel n'a réussi depuis, et « N éléments en échec · Réessayer » qui les remet en file.
- **Android à reprendre** : livré dans la même étape (Réglages › Classement).

### 2026-11-08 — Inbox : « Tâches à classer » et « Quand ? »

- **Problème** : une tâche rangée par le classement automatique (projet ou domaine) quittait l'Inbox sans date et n'était plus jamais revue ; le web n'avait d'ailleurs aucune section « Tâches à classer ».
- **Décision** : section « Tâches à classer » sous la saisie de l'Inbox web, même règle qu'Android (`GET /tasks?type=unsorted`) ; une tâche classée sans moment y reste avec « Quand ? » : Cette semaine, Une date, Plus tard, Sans date.
- **Android à reprendre** : livré dans la même étape.

### 2026-11-08 — Passe « rien ne se perd »

- **Problème** : des éléments sortaient sans bruit de tout ce que l'on regarde : cartes du classement cachées derrière Ma journée, liens « à revoir » jamais revus, « Supprimer » d'« À trier » immédiat, erreurs génériques, libellés ambigus (« Aucun » deux fois, « Jeter » qui archive).
- **Décision** : « À trier (n) » dans l'en-tête de l'Inbox ; carte « Lien à revoir » (Garder, Archiver, Dans 30 jours) ; suppression avec fenêtre d'annulation ; « Déjà traité ailleurs. » retire la carte ; « Ignorer » pour écarter une carte, « Archiver le nouveau » pour un doublon.
- **Android à reprendre** : livré dans la même étape (plus : notifications périmées retirées, texte de notification qui dit ce que « Tout accepter » pose, état vide de l'Inbox).

### 2026-11-12 — TODO.md : une tâche du fichier reste une vraie tâche

- **Problème** : une tâche venue d'un `TODO.md` était verrouillée entièrement (chips, date, priorité, épingle, menu, supprimer, sous-tâches, panneau désactivé à 60 % d'opacité) ; seule la case passait.
- **Décision** : le fichier garde le nom, la note, la case et le projet ; le reste est à Cadence (priorité, dates, étiquettes, domaine, objectif, estimation, épingle, « Aujourd'hui », responsable). Ligne : case ronde, titre et menu ouverts, épingle et options disponibles, pas de Supprimer. Panneau : titre et note en lecture seule avec le badge TODO.md et le bandeau, le reste s'édite ; la note et les sous-tâches restent verrouillées comme avant. Un enregistrement refusé (`todo_md_read_only`) affiche le bandeau TODO.md au lieu d'un échec générique.
- **Android à reprendre** : le serveur accepte désormais les champs Cadence d'une tâche du fichier (web, API, MCP, synchro) ; l'écran Android garde son verrou complet tant qu'il n'est pas repris (fiche, glissement, menu, case).

### 2026-11-12 — Planifier (ex-« 7 prochains jours ») : tableau à la Todoist

- **Problème** : « 7 prochains jours » était une liste plate, sans Inbox, sans calendrier, sans réglage ; impossible d'y planifier vraiment.
- **Décision** : page « Planifier » (`/upcoming`, l'ancienne liste reste à `?classic=1`). Colonne Inbox à gauche (glisser une idée sur un jour en fait une tâche prévue ce jour-là), une colonne par jour, cartes façon Todoist (case ronde à gauche colorée par la priorité, heure, durée, projet, étiquette), « + Ajouter une tâche » en bas de colonne. Calendrier à droite, largeur réglable, masquable, sur 1, 3 ou 7 jours et sur n'importe quel jour (cliquer l'en-tête d'un jour l'y amène) ; glisser une carte sur le calendrier pose un créneau ce jour-là, sans toucher l'échéance. Mode Horizons : Cette semaine (`week_of`), Ce mois-ci et Mois prochain (`month_of`), Un jour (`#someday`) ; glisser une carte d'un horizon à l'autre change ce champ. Menu « Affichage » : grouper (projet, priorité, étiquette), trier, masquer les terminées, colonne Inbox, calendrier ; mémorisé par appareil. Le détail d'une tâche s'ouvre en popup large comme sur Aujourd'hui. Aujourd'hui gagne aussi « Masquer les terminées » dans son menu « … ».
- **Android à reprendre** : `TODO.md` › Now (Planifier, Horizons et `month_of` dans Room, masquer les terminées).

### 2026-11-12 — Planifier : passe après la revue UX

- **Problème** : revue du 2026-11-12 (20 constats) : calendrier qui écrasait les jours, 1 ou 2 jours visibles, retards absents, pas de charge en heures, pas de clavier, sous-tâches en double, annulation qui effaçait les actions suivantes, en-têtes tronqués.
- **Décision** : 14 jours en colonnes fixes (264 px) qui défilent, une seule barre (Aujourd'hui, semaine ±, choix de date) ; calendrier borné 280–600 px, en tiroir sous 1180 px, qui suit le jour choisi ; bande « En retard » repliable avec « Tout replanifier aujourd'hui » (jamais d'échéance modifiée) ; Inbox en barre fine quand vide ; « + » dans chaque en-tête (jours, horizons, Inbox) ; en-tête de jour sur deux lignes (« Aujourd'hui », « jeu. 12 nov. ») avec la charge « 4 h 45 / 10 h », rouge au-delà ; terminées repliées en bas ; une sous-tâche datée n'apparaît qu'une fois (« ↳ parent ») ; ajout rapide qui lit « demain 14h #Travail 30min » ; filtres projet, étiquette, priorité ; clavier : flèches ou h/j/k/l, Maj+←/→ déplace d'un jour, t / Maj+T, M saisit la carte (indépendant de la disposition du clavier) ; écritures en file, annulation par opérations inverses, l'heure d'un créneau suit la tâche déplacée ; popup de tâche : « Planifiée jeu. 12 nov. · 10:00 ».
- **Android à reprendre** : `TODO.md` › Now (entrée Planifier).

### 2026-11-12 — Planifier : l'Inbox crée des tâches et liste les tâches à classer

- **Problème** : le « + » de la colonne Inbox créait une idée, pas une tâche ; les tâches sans moment (« Tâches à classer ») n'apparaissaient pas dans Planifier.
- **Décision** : le « + » crée une vraie tâche, lue comme l'ajout rapide d'un jour (`#projet`, étiquettes, priorité, durée ; jamais d'échéance). Une date (ou une heure, aujourd'hui) la planifie ce jour-là ; sans date elle reste dans « Tâches à classer » (`needs_when` posé si elle a un projet). La colonne liste d'abord ces tâches (`GET /tasks?type=unsorted`, cartes de tâche à case ronde, clic = fiche), puis les idées ; les deux se glissent sur un jour, le calendrier ou un horizon ; le compteur de la barre repliée et l'état vide comptent les deux. Une tâche planifiée sur un jour affiché quitte la colonne (le serveur la compte encore à classer : un jour du plan n'est pas un moment). Le champ reste ouvert après Entrée et garde le texte en cas d'échec.
- **Android à reprendre** : `TODO.md` › Retours en direct.

### 2026-11-12 — Icône de la source sur les tâches

- **Problème** : une tâche venue de Gmail, de Telegram ou de Claude ne le montrait nulle part ; le « TODO.md » était le seul badge d'origine.
- **Décision** : petite marque en lettre (« M » rouge pour Gmail, sans logo) avec le nom, sur la ligne de Aujourd'hui, la carte de Planifier, la ligne de tâche et la fiche. Avec un lien, un clic l'ouvre dans un nouvel onglet sans ouvrir la tâche. Une tâche web n'a pas de badge.
- **Android à reprendre** : `TODO.md` › Now (badge de source et champs `source` / `source_url` dans Room).
