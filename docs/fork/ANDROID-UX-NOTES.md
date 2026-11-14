# Notes UX Android → web

Journal des décisions d'interface prises sur l'app Android, pour que le web les reprenne. Pendant de `WEB-UX-NOTES.md` (web → Android). Une entrée par changement : ce qui n'allait pas, ce qui a été décidé, ce que le web doit reprendre. Le comportement compte, pas le code Kotlin.

## Journal

### 2026-11-13 — Une seule liste des agendas, Réglages depuis chaque onglet

- **Problème** : la feuille « Affichage » de l'Agenda et Réglages › Agendas réglaient les mêmes agendas autrement (puces « Masquer partout » d'un côté, « Utiliser dans Cadence » et agendas inutilisés de l'autre) ; les Réglages ne s'ouvraient que depuis Habitudes et le sélecteur de listes de Tâches.
- **Décision** : une seule liste des agendas, la même dans les deux écrans (par compte, utilisés puis non utilisés, puces Agenda · Liste Tâches · Notifications · Cocher une fois passé) ; la feuille garde au-dessus ses interrupteurs d'affichage propres à la vue et finit par « Tous les réglages des agendas », qui ouvre directement Réglages › Agendas (retour = Agenda). L'engrenage des Réglages est en dernier à droite de l'en-tête de Tâches, Agenda, Habitudes et Bilan.
- **Web** : rien à reprendre ; le web ne lit pas les agendas de l'appareil et ouvre le Profil depuis la barre latérale, présente partout.

### 2026-11-12 — Plan des notes et descriptions, barre au-dessus du clavier

- **Problème** : un téléphone n'a ni Tab, ni Alt+↑/↓, ni Ctrl ; le clavier n'envoie que des textes successifs ; la barre de mise en forme n'avait que cases, puces, titre et gras ; pas de choix `@`, une puce vers une cible inconnue ne faisait qu'un message.
- **Décision** : mêmes règles de texte que le web (Entrée et retour arrière reconnus dans la saisie) ; une seule barre défilante au-dessus du clavier, plan d'abord (sortir, décaler, monter, descendre, replier, zoomer, case, tâche liée) puis mise en forme (gras, italique, barré, titre, listes, citation, code, lien, `[[`, `@`, tableau par tailles toutes faites), « Terminé » fixe à droite ; une puce repliée se lit « … » dans le champ, un curseur qui y entre la déplie ; le zoom de l'éditeur montre le seul sous-arbre avec « Tout › … » au-dessus. Les propositions `@` et `[[` s'affichent en pastilles au-dessus de la barre. En lecture, chevron à gauche de chaque puce repliable (place réservée pour l'alignement) et point qui zoome. Une case liée sans tâche connue sur l'appareil se coche dans le texte, comme une case ordinaire.
- **Web** : rien à reprendre.

### 2026-11-12 — Un lien seul dans l'ajout rapide, origine des tâches

- **Problème** : une adresse collée dans l'ajout rapide n'avait que Inbox / Tâche / Note (la tâche prenait l'adresse brute pour nom) ; une tâche née d'un lien proposait encore « Ajouter aux liens » ; l'origine d'une tâche (Gmail, MCP…) n'apparaissait pas.
- **Décision** : comme le web, une adresse seule propose Inbox · Tâche · Liens · Note ; « Dans les liens » d'emblée quand l'adresse est déjà gardée ; badge d'origine neutre (lettre et nom) sur la ligne et la fiche, sans couleur de marque (aucune couleur littérale sur Android).
- **Web** : rien à reprendre ; la marque colorée du web reste un écart volontaire.

### 2026-11-12 — Markdown, puces de liens et rétroliens

- **Problème** : une description de tâche s'affichait en texte brut ; `[[task:…]]`, les mentions et les tableaux du web n'étaient pas rendus ; aucun rétrolien.
- **Décision** : la description d'une tâche se lit rendue comme une note (crayon pour éditer le texte brut) ; puces pour les notes, tâches et personnes (une personne ne s'ouvre pas : pas de fiche sur Android) ; « Rétroliens » en bas des notes et des fiches, seulement s'il y en a et en ligne.
- **Web** : rien à reprendre.

### 2026-11-12 — Ranger Aujourd'hui au doigt, frise déplaçable

- **Problème** : ranger demandait Monter / Descendre, un rang à la fois, et l'ordre (`today_order`) n'était pas celui du web (plan du jour) ; la frise de Ma journée était en lecture.
- **Décision** : une poignée à droite des tâches sans heure ; seul un glisser vertical sur elle range, donc ni le balayage ni l'appui long de la ligne ne se déclenchent. L'ordre écrit est celui du plan du jour. Sur la frise, appui long sur un créneau puis glisser pour le déplacer, depuis son bord droit pour l'étirer, au quart d'heure, avec « Annuler ».
- **Web** : rien à reprendre ; l'ordre est déjà le même.

### 2026-11-12 — Planifier sur le téléphone

- **Problème** : « À venir » ne montrait que les échéances des 7 jours ; le web a une page « Planifier » (Inbox, 14 jours, horizons) qui écrit le plan, jamais l'échéance.
- **Décision** : même page en une colonne (Jours | Horizons) au lieu de 14 colonnes ; déplacer = appui long puis feuille « Planifier » (un jour, un horizon, retirer du jour) plutôt qu'un glisser à travers 14 sections ; les cartes gardent la ligne de tâche d'Android (case carrée, balayages), pas la carte ronde du web. Le retard s'appelle « Échues », comme ailleurs sur Android.
- **Web** : rien à reprendre ; la feuille pourrait servir au web mobile (390 px), où glisser entre colonnes est pénible.

### 2026-11-12 — Planifier écrit le plan, jamais l'échéance

- **Problème** : « Reporter » et « Placer » écrivaient l'échéance (heure comprise) ; « Plus tard » effaçait la vraie échéance. Un créneau ou un report déplaçait donc en silence un rappel ou une échéance.
- **Décision** : « Reporter » déplace la tâche du plan d'aujourd'hui vers le jour choisi, ou l'ajoute à ce jour ; « Placer » pose un créneau (heure et durée du bloc). L'échéance ne bouge pas. Une tâche planifiée demain quitte Aujourd'hui et le retard, et figure dans « Demain ». Hors ligne, ces écritures se mettent en file et « Annuler » les défait (retrait de l'appel s'il n'est pas parti, sinon inverse).
- **Ma journée** : le tri des échues (Aujourd'hui, Demain) écrit aussi le plan ; « Plus tard » pose `someday` et garde l'échéance. Seules la proposition « À déplacer » du Résumé et « Choisir une date » du bilan changent l'échéance, comme sur le web : c'est leur objet.
- **Reste** : le serveur ne retire plus une tâche du plan quand son échéance change (`leaveOnMove` supprimé) ; l'ancienne page Aujourd'hui du web (`?classic=1`) garde `movedPastDay`.

### 2026-11-08 — Liens dans les tâches et les notes

- **Problème** : une adresse dans le titre d’une tâche ou d’une note et dans la note d’une tâche se comportait comme du texte à éditer.
- **Décision** : hors édition, les adresses, e-mails et numéros reconnus sont soulignés et s’ouvrent au toucher ; le bouton Modifier à côté du champ permet de changer son texte. Le corps des notes conserve ses liens Markdown.
- **Correction du 2026-11-08** : dans un nom de domaine, un tiret typographique copié depuis du texte est converti en tiret ordinaire pour ouvrir l’adresse ; l’affichage et la sélection conservent le texte saisi. Les chemins d’URL ne sont pas modifiés.
- **Correction complémentaire du 2026-11-08** : un caractère de format invisible collé après l’adresse (notamment `U+2060`) ne fait plus rejeter le lien ; sa plage et la cible s’arrêtent avant ce caractère.
- **Web** : les liens du texte y sont déjà ouvrables ; conserver l’édition distincte de l’ouverture.

### 2026-11-06 — « À trier » : une file de propositions

- **Problème** : le résumé posait des questions absurdes (« 💪 Sport est-il un doublon de 💪 Sport ? ») au milieu d'un écran de lecture.
- **Décision** : une file séparée, une proposition à la fois avec sa raison, valider, corriger, garder telle quelle, passer ; les doublons se déduisent par le code et disent ce qui distingue les tâches. Ma journée n'affiche qu'une entrée « À trier (n) ».
- **Web** : `/triage`, même logique, sans fenêtre d'annulation (le geste part tout de suite).

### 2026-11-06 — Habitudes : carte neutre, couleur au prorata

- **Problème** : les cartes étaient entièrement colorées alors que rien n'était fait : tout avait l'air terminé et écrasait l'écran.
- **Décision** : carte sombre neutre comme « Mes abstinences » ; la couleur se remplit de gauche à droite selon l'objectif de la période (jour ou semaine), pleine seulement une fois l'objectif atteint. Abstinence, plafond et suivi simple restent neutres, sans alerte (arbitrage du 2026-11-06). La teinte est ajustée pour que la même encre se lise sur les deux parties.
- **Web** : repris dans la même étape (`HabitCard.tsx`). Les widgets n'ont jamais eu de cartes colorées.

### 2026-11-06 — Ma journée : un seul écran pour le résumé et la planification

- **Problème** : l'en-tête « Résumé du jour » et « Planifier la journée » se répétaient, la frise n'était faite que de pilules grises sans repère, et chaque alerte portait deux boutons de vote.
- **Décision** : une seule entrée dans Aujourd'hui, un seul écran « Ma journée » ; chaque tâche n'y paraît qu'une fois ; frise graduée toutes les deux heures, travail et soir colorés, événements à leur heure avec leur titre ; lecteur sur une ligne ; un retour discret en bas et « Moins de ce type » dans le ⋯ de chaque alerte ; plus de notes dans les lignes.
- **Web** : page renommée, frise, retour, « Autre date », heure de préparation, « Réglé » replié repris dans la même étape. La planification du web reste sur sa page Aujourd'hui.

### 2026-11-06 — Résumé : une seule mention d'échéance, Priorités du jour, surcharge lisible

- **Problème** (revue du 2026-11-06) : « Demain » + « Due demain » sur la même ligne ; « Ce soir » listait des tâches qui n'ont rien du soir ; « 525 min de trop » comparait aussi les événements au seul soir ; « Pas cette date » refusait sans proposer d'autre jour ; « Source non lue » occupait l'écran pour rien ; le lecteur disait « Chapitre 3 sur 3 ».
- **Décision** : la ligne garde sa date et le motif ne la répète plus ; « Priorités du jour » remplace « Ce soir » (être dans un projet ne suffit plus) ; la charge compare les tâches au temps libre de la journée et du soir, en heures ; « Autre date » ouvre le sélecteur ; « Réponses attendues » disparaît sans réponse ; « Réglé » est replié ; l'en-tête dit « préparé à 07:00 » ; le lecteur montre le titre de la partie. Noir pur : `outline` et `outlineVariant` éclaircis (les textes secondaires étaient déjà à 12:1).
- **Web** : Priorités du jour et surcharge repris ; le reste dans `TODO.md` › Now.

### 2026-11-04 — Résumé : voix Piper à la demande, retour immédiat, bilan du soir

- **Problème** (essai de la 1.10.1 sur un Pixel) : sans voix Piper installée, « Écouter » lisait avec la voix du système ; toucher la case, la pastille de date, Oui/Non/Préciser ou Utile/Bruit ne changeait rien à l'écran ; la bannière « Annuler » se posait sous les boutons de navigation d'Android (invisible avec 3 boutons) ; rien ne marquait la fin de journée.
- **Décision** :
  - Voix : la voix du système disparaît du résumé. Sans voix installée, « Écouter » ouvre une feuille (Siwis ou Tom : licence, taille), télécharge avec progression, puis prépare (« Préparation de la voix… ») et lit. Le MP3 du serveur reste la seule autre source.
  - Retour immédiat : chaque geste se voit à l'appui. La case coche et barre la ligne ; la pastille de date devient « Déplacé · Jeu 5 » et « Pas cette date » disparaît ; Oui/Non/Préciser deviennent « Réponse : Oui » ; Utile/Bruit deviennent « Avis : Utile ». Puis la bannière « Annuler », qui rend les boutons. Une écriture qui échoue défait l'état et le dit. Les décisions du jour sont gardées : la carte ne se rouvre pas au prochain passage.
  - Bannières : l'hôte s'arrête au-dessus des boutons du système sur tous les écrans sans barre flottante (résumé, recherche, revue, objectifs, réglages).
  - Bilan du soir : après l'heure de bascule (Réglages › Résumé › Bilan du soir, 18:00 par défaut, réglé côté serveur), la carte d'Aujourd'hui et l'écran passent au bilan : verdict et compteurs, Ce soir, Fait aujourd'hui, Glisse (avec « Reporter à demain », « Reporté à demain » ensuite), Demain (une frise). Lien discret « Voir le résumé du matin » et retour « Voir le bilan du soir ». Le bilan se lit avec la même voix (intro, fait, ce soir, demain). « Reporter à demain » est un appel différé (hors ligne compris) ; « Annuler » le retire s'il n'est pas parti, sinon retire la tâche du plan de demain, sauf si la dernière lecture du plan l'y montrait déjà.
  - Cache : table Room `evening` à part (le `brief` a la date pour clé unique et une version ; le bilan n'a ni version ni statut, le serveur le recalcule à chaque lecture), Room des tâches v13.
- **Web** : les cartes décidées (« Déplacé · jeudi 5 », « Réponse : Oui », « Avis : Utile ») et la ligne cochée à l'appui sont à vérifier sur la page du résumé web ; le bilan du soir web existe déjà (docs/39).

### 2026-11-04 — Notes dans la page d'un projet

- **Problème** : une note rattachée à un projet n'apparaissait que dans la liste Notes ; la page du projet sur Android ne montrait que tâches et sous-projets, alors que le web affiche ses notes.
- **Décision** : section « Notes » sous les tâches du projet, épinglées d'abord ; toucher une note l'ouvre. Pas encore de « Nouvelle note » depuis le projet (le web l'a).
- **Web** : rien à reprendre.

### 2026-11-04 — Ajout rapide des widgets = la saisie de l'app

- **Problème** : les widgets, la tuile et les raccourcis de l'icône ouvraient une carte à part (titre, Aujourd'hui/Demain/Sans date) : ni `#étiquette`, ni `+projet`, ni `!1`-`!3` reconnus ou proposés, le texte devenait le titre tel quel.
- **Décision** : cette fenêtre ouvre la même saisie que l'app (`QuickAddSheet`) : suggestions en direct, pastilles, destination Tâche ou Inbox (celle du raccourci d'abord), saisie qui reste ouverte pour la tâche suivante. Plus d'échéance « Aujourd'hui » d'office : la date se tape (« auj », « demain ») comme dans l'app.
- **Web** : rien à reprendre (la capture web reconnaît déjà ces jetons). Reste : rien d'essayé sur le téléphone ni l'émulateur (non joignables).

### 2026-11-02 — Passe de soustraction (revue UI/UX complète)

- **Problème** : avec cinq tâches, l'écran Tâches montrait trois rangées de pastilles (épinglés, sept onglets, domaines), puis trois cartes (agendas, jauge de charge, « Terminer la journée » avec le plus gros bouton de l'écran) avant la première tâche. Chaque ligne portait trois signaux de couleur (case, liseré, point de priorité) et une pastille de date ; chaque idée de la Boîte cinq boutons ; la fiche un gros « Terminer » pris pour « Enregistrer » ; Projets, Étiquettes et Bilan des cartes identiques pleines de « 0 ». Critique indépendante sur captures : 4/10.
- **Décision** : retirer plutôt qu'ajouter.
  - En-tête : le titre est la liste ouverte (« Aujourd'hui ▾ ») et ouvre un sélecteur : épinglés, listes (Aujourd'hui, À venir, Projets, Étiquettes, Notes, Terminées), domaine, Réglages. Objectifs ne vit plus que dans Bilan. Icônes d'en-tête nues, ajout toujours par le bouton flottant (Habitudes compris).
  - Aujourd'hui : les tâches d'abord ; la charge ne s'affiche que pour une journée pleine (une ligne, sans jauge) ; plus de bannière d'agendas (l'Agenda et Réglages › Agendas la proposent) ; matin et soir en lignes texte, le soir après les tâches.
  - Lignes : date en texte simple (retard neutre), projet en sa couleur sous le titre, priorité haute = case rouge ; plus de liseré par défaut ni de point de priorité.
  - Boîte : « Aujourd'hui » et « … » par idée.
  - Fiche : on termine par la case à côté du titre ; horizon, prochaine action et champs serveur seulement s'ils servent ou sous « Plus de champs » ; plus de ligne « Liens et commentaires : sur le web ».
  - Projets, Étiquettes : lignes simples, nombre seulement s'il est non nul, pas de barre d'avancement. Bilan : pas de graphique tant que rien n'est fait, plus de liste « échues » en double.
  - Couleur : surfaces neutres (plus de lavande), couleur réservée au projet, à la priorité haute et à l'action principale.
- **Web à reprendre** : tout, à l'étape suivante (`TODO.md` › Next). Équivalents : la barre latérale garde son rôle de sélecteur ; le reste (Aujourd'hui, lignes, Boîte, fiche, Projets, surfaces) s'applique tel quel.

### 2026-11-02 — Tâches ne rouvre plus la dernière fiche ; textes longs lisibles

- **Problème** : après une tâche ouverte depuis un widget ou un rappel, chaque passage Inbox → Tâches rouvrait cette fiche (l'extra de l'intent restait lu). Le champ d'ajout rapide tenait sur une ligne qui défilait de côté : un long titre ne se lisait pas. Une idée longue de l'Inbox était coupée à trois lignes sans moyen de la lire en entier, sauf « Modifier ».
- **Décision** : la tâche demandée par le widget, le rappel ou le Bilan est servie une fois puis oubliée (`TaskOpening`) ; changer d'onglet ne rouvre rien. Le champ d'ajout rapide passe à la ligne (six lignes, puis défile) ; Entrée valide toujours, un saut de ligne collé devient une espace (`singleLineCapture`). Le renommage d'une sous-tâche passe aussi à la ligne. Une idée longue garde trois lignes et un lien « Afficher tout » / « Réduire ».
- **Web** : rien à reprendre (le champ d'ajout du web passe déjà à la ligne, les idées s'affichent en entier). Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Passe d'épure : sous-titres d'explication (reprise du web)

- **Problème** : les onglets Objectifs et Terminées affichaient une phrase d'explication sous le titre, comme le bouton « i » que le web vient de retirer.
- **Décision** : plus de sous-titre sur Objectifs ni Terminées ; « 7 prochains jours » reste sur À venir.
- **Web** : même étape. Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Passe d'épure : fiche de tâche (reprise du web)

- **Problème** : sous les badges, la fiche gardait sept lignes (Dates, Répétition, Estimation, Priorité, Statut, Étiquettes, Projet) même vides (« Aucune », « Sans projet »), et répétait en ligne ce que les badges montraient déjà ; un titre « Sous-tâches » coiffait le seul champ d'ajout.
- **Décision** : `DetailFieldRules` : une valeur portée par un badge (échéance seule, répétition, priorité, statut, étiquettes, projet) n'a plus de ligne, le badge s'ouvre d'un toucher ; Dates et Projet restent même vides ; l'estimation remplie garde sa ligne ; les autres champs vides attendent « Plus de champs ». Pas de titre « Sous-tâches » sans sous-tâche.
- **Web** : même étape (étiquettes vides dans « Plus », pas de titre Sous-tâches ni Commentaires à vide). Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Passe d'épure : onglets de Tâches (reprise du web)

- **Problème** : les pastilles « À venir 14 » et « Notes 23 » et les sous-titres « 9 étiquettes », « 23 notes » répétaient des comptes sans action attendue.
- **Décision** : seul l'onglet « Aujourd'hui » garde un compte ; plus de sous-titre de comptage sur Étiquettes et Notes (Projets garde « N actifs · N dans le stash »).
- **Web** : même étape (barre latérale : comptes sur Aujourd'hui et Boîte seulement). Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Passe d'épure : Aujourd'hui (reprise du web)

- **Problème** : la jauge « 0 min planifiées » s'affichait sur un jour vide, la carte du matin comptait le retard (« 3 à replanifier »), les en-têtes « Aujourd'hui » et « Demain » répétaient un compteur déjà porté par l'onglet.
- **Décision** : jauge seulement si une tâche est planifiée (`DayRhythm.capacityVisible`), résumé du matin sans compte de retard (seulement « à placer » et suggestions, ligne omise si vide), en-têtes de section sans compteur.
- **Web** : même étape (voir WEB-UX-NOTES). Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Objectifs et liste d'envies : un seul écran calme

- **Problème** (émulateur, ~5 objectifs, 15 résultats clés, 62 envies) : l'onglet Objectifs était le cinquième des Tâches, hors de l'écran ; il ouvrait une deuxième rangée d'onglets Objectifs / Liste d'envies ; une carte d'objectif occupait tout l'écran (chaque résultat clé avec sa barre) sans dire quoi faire ensuite ; les 62 envies formaient une colonne de grosses cartes sans recherche, sans ajout, sans geste « faite », les réalisées mêlées aux autres, « Écrire » rangé après « Voir » ; la liste d'envies s'ouvrait au milieu (défilement repris de l'autre onglet) ; le bouton + créait une tâche ; les états de la fiche étaient décalés.
- **Décision** : un seul écran défilant. Recherche en tête (titre ou note, sans casse ni accents ; ouvre les groupes qui correspondent). Section « Objectifs » : carte par objectif actif (titre, %, horizon et échéance, barre fine, « Prochain pas » avec sa case, ou « Ajouter un prochain pas », résultats clés en lignes d'une ligne « titre … 3/10 », coche quand tout est fait). « En pause, atteints ou abandonnés » replié. « Liste d'envies » : Avoir, Être, Faire repliés avec leur nombre ; ligne = case « Réalisée » (avec « Annuler »), titre, prochain pas éventuel, bouton « Créer une tâche » ; « Réalisées » repliées à part. Le bouton + de l'écran ajoute des envies à la suite (nom, groupe ; la feuille reste ouverte). Prochain pas = tâche ouverte de premier niveau liée au but (ou à un résultat clé), échéance la plus proche, puis la plus ancienne, puis le nom : même règle que le serveur (`next_task` de `GET /api/goals`). La fiche met « Prochain pas » et « Créer une tâche » en premier. Onglet Objectifs juste après Projets. Logique pure : `model/Goals.kt` (`overview`, `nextStep`, `filter`).
- **Web** : repris dans la même étape sur `/goals` (même ordre, mêmes groupes repliables, recherche, case « Réalisée », « + » de tâche, champ « Ajouter une envie… » au bas de chaque groupe ouvert).

### 2026-11-01 — Revue rapide sur Android

- **Problème** : la revue s'ouvrait sur l'onglet gardé, sans dire par où commencer ; l'onglet « Plus tard » affichait la taille du stock (133) comme une dette ; le stock n'était relu que par « Trier un par un ».
- **Décision** : une carte « Revue rapide » (une phrase, « Commencer ») au-dessus des onglets ouvre un écran plein : un élément à la fois (son type, son titre ou sa carte de lien, son contexte), ses choix d'un toucher, « Passer », « N sur M » et une barre fine ; retour = arrêter. Même file que le web (`QuickReview.build`, 10 au plus, au moins 3 idées de « Plus tard » regardées il y a le plus longtemps), « Garder de côté » d'un toucher pour une idée de « Plus tard ». Un élément décidé ailleurs (liste, autre appareil) quitte la session. L'onglet « Plus tard » ne compte que les revues arrivées.
- **Web** : repris dans la même étape, avec en plus les raccourcis clavier.

### 2026-11-01 — Projet TODO.md d'un dépôt git : état de synchro sur Android

- **Problème** : sur Android, un projet tiré d'un dépôt ne disait jamais s'il était à jour, et une case refusée par le dépôt revenait seule à son état avec « 1 modification refusée par le serveur ».
- **Décision** : même ligne que le web sous le titre du projet (synchronisé · il y a N min, conflit nommé, N modifications en attente, erreur), lue en ligne toutes les 30 s, avec « Réessayer » et « Abandonner » quand il reste des modifications ; un refus `todo_md_conflict` / `todo_md_repo_unreachable` est dit en clair dans la ligne de synchro et la liste des refus.
- **Web** : la ligne du projet existe ; la page Synchronisation web pourrait aussi traduire ces deux raisons de refus.

### 2026-11-01 — Arborescence (outliner) d'un projet

- **Problème** : la page d'un projet listait les tâches de premier niveau ; les sous-tâches ne se voyaient que dans la fiche, et rien ne permettait de les réorganiser.
- **Décision** : un bouton de l'en-tête du projet bascule vers l'outliner (retenu sur l'appareil). Les tâches ouvertes du projet, chacune suivie de ses sous-tâches ouvertes, décalées d'un cran. Toucher une ligne la choisit et montre Monter, Descendre (dans son groupe de sœurs), Décaler (devient la dernière sous-tâche de la tâche précédente), Ressortir (remonte juste après son parent), Ajouter après (même retrait) et Ouvrir ; la case termine. Retrait = `parent_task_uid`, un seul niveau ; rang = `order` du groupe, renuméroté 0..n quand l'ordre change ou qu'une tâche y entre (un groupe qui perd une tâche garde ses rangs) ; sans `order`, l'ordre de la liste. Une série ne devient pas sous-tâche et n'en reçoit pas, une tâche qui a des sous-tâches ne se décale pas. Projet TODO.md : seule la case. Logique pure : `model/Outline.kt`.
- **Web** : l'onglet « Arborescence » du web garde les mêmes règles (parent = retrait, un seul niveau, `order` des sous-tâches). Écart : le web range les tâches du projet par son ordre personnalisé (`user_task_orders`, non synchronisé), Android par `order` ; à unifier côté serveur (synchroniser l'ordre du projet, ou lire `order`).

### 2026-11-01 — Notes et liens : liste ou galerie

- **Problème** : les notes n'existaient qu'en grille de cartes, les liens qu'en liste ; impossible de parcourir beaucoup de notes d'un coup d'œil, ni de voir les liens par leur image.
- **Décision** : un bouton de l'en-tête bascule Liste / Galerie, retenu par écran sur l'appareil (notes : galerie par défaut ; liens : liste). Liste des notes : une ligne par note (pastille de couleur, titre, une ligne de texte, épingle). Galeries : colonnes d'au moins 160 dp (deux sur un téléphone). Mêmes cartes que la galerie des découvertes pour les liens.
- **Web** : vue galerie et outliner en cours côté web (`TODO.md`, Ideas) ; garder le même choix par écran et le même défaut.

### 2026-11-01 — Un seul « + » dans Habitudes, pas de « 0 » sur les onglets

- **Problème** : sans habitude, l'écran montrait deux boutons d'ajout (le « + » de l'en-tête et celui de l'état vide) ; un onglet à pastille affichait « Notes 0 ».
- **Décision** : le « + » de l'en-tête reste seul, l'état vide dit « Touchez + en haut pour créer une première habitude. » ; un compteur d'onglet à zéro n'est pas affiché (règle dans `TabPill`, comme les en-têtes de section).
- **Web** : déjà ainsi (passe « UI épurée » du 2026-11-01) ; rien à reprendre.

### 2026-11-01 — Galerie des découvertes dans l'écran Liens

- **Problème** : décider des liens partagés demandait de les ouvrir un par un ; la liste ne montrait ni l'image de la page ni de quoi les rattacher à un projet.
- **Décision** : un bouton de l'en-tête bascule Liste / Galerie (retenu sur l'appareil). La galerie est une grille de cartes : image de la page si le serveur l'a lue (sinon rien), titre, site, étoiles, début du README d'un dépôt, note, puis Tester, Rattacher, Reporter, Jeter d'un toucher. Rattacher demande un projet et y crée une tâche au nom du lien (l'adresse et la note en note de tâche), le lien passe en « gardé ». La carte part tout de suite, « Annuler » pendant 4,5 s ; l'idée de l'Inbox qui porte le lien est traitée avec.
- **Web** : à reprendre sur `/links` (cartes en grille déjà là) : la décision « Rattacher » (projet, tâche au nom du lien) et l'image de la page sur la carte.

### 2026-11-01 — Partager vers l'Inbox en moins d'une seconde

- **Problème** : après « Partager › Cadence », la fenêtre attendait la fin de l'écriture avant de se fermer ; au premier lancement (base à ouvrir), l'application d'origine restait figée un moment.
- **Décision** : la fenêtre se ferme dès sa création ; l'écriture (Inbox et file d'envoi, jamais le réseau) continue en arrière-plan, puis le toast « Ajouté à l'Inbox » confirme, ou « Impossible d'ajouter à l'Inbox » si elle échoue. Le sujet du partage sert quand il n'y a pas de texte. Mesure : fermée en moins d'une seconde, sans appel réseau (`ShareCaptureTest`).
- **Web** : pas d'équivalent système ; rien à reprendre.

### 2026-11-01 — « En attente » compte les habitudes

- **Problème** : la ligne de synchro comptait les tâches et les appels différés, pas les habitudes restées sur le téléphone.
- **Décision** : une ligne d'habitude non envoyée compte (une seule fois par ligne, même si plusieurs champs changent) ; rien ne compte pour un autre compte dont la synchro est coupée.
- **Web** : rien à reprendre.

### 2026-11-01 — Raccourci « Inbox » sur l'icône

- **Problème** : pour noter une idée sans date, il fallait ouvrir la liste des tâches puis choisir l'Inbox.
- **Décision** : second raccourci statique « Inbox » ; la fenêtre d'ajout rapide n'affiche alors ni échéance ni « Nouvelle tâche » et écrit dans l'Inbox.
- **Web** : pas d'équivalent système ; la capture rapide web reste Ctrl+K.

### 2026-11-01 — Domaine dans l'ajout rapide : `~nom`

- **Problème** : le web désigne un domaine par `~nom` dans la saisie, Android l'ignorait.
- **Décision** : `~nom` reconnu comme les autres jetons (`#`, `+`, `@`), seulement pour un domaine existant ; sinon le mot reste dans le titre. Pure logique dans `QuickAddParser`.
- **Web** : rien à reprendre.

### 2026-11-01 — Ordre des habitudes par groupe sur Android

- **Problème** : « Monter » et « Descendre » échangeaient avec la voisine de toute la liste, pas de son groupe ; deux habitudes au même rang ne bougeaient pas.
- **Décision** : déplacement dans le groupe affiché, groupe renuméroté 0..n ; la copie se place à la fin du groupe. Logique pure dans `domain/HabitOrder.kt`.
- **Web** : déjà ainsi (`frontend/utils/habitOrder.ts`) ; rien à reprendre.

### 2026-11-01 — Passe « UI épurée » reprise sur Android

- **Problème** : des écrans Android gardaient les réflexes d'avant la passe web : date passée en rouge dans les widgets et la barre de l'agenda, « 0 » affiché dans les en-têtes de section.
- **Décision** : une échéance passée reste neutre partout (ligne, widget, bloc « À replanifier ») ; un compteur à zéro ne s'affiche pas. Priorité haute reste rouge (c'est une priorité, pas une échéance).
- **Web** : rien à reprendre ; la passe est alignée. Reste à vérifier sur le téléphone.

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

### 2026-11-01 — Liens entre notes `[[titre]]`

- **Problème** : relier deux notes obligeait à retrouver la note par la recherche ; une référence écrite dans le texte ne menait nulle part.
- **Décision** : `[[titre]]` s'affiche en pastille cliquable qui ouvre la note au titre égal (casse et espaces aux bords ignorés) ; sans correspondance, un message « Note introuvable ». Un titre vide, sur deux lignes ou imbriqué reste du texte.
- **Web** : pas encore d'équivalent (voir `TODO.md`, Petits restes).

### 2026-11-01 — Liens dans la recherche globale

- **Problème** : retrouver un lien par son site ou une note disait « rien trouvé » ; seuls tâches, notes, projets et objectifs étaient cherchés.
- **Décision** : les liens entrent dans la recherche (titre, site, note) avec un filtre « Liens » ; toucher un résultat ouvre le lien dans le navigateur, comme la carte de la liste des liens.
- **Web** : la recherche globale n'a pas encore de liens (voir `TODO.md`, Petits restes).

### 2026-11-01 — Filtres de l'écran Liens : statut et étiquette

- **Problème** : l'écran Liens ne filtrait que par type et « Jetés » ; retrouver les liens gardés, à tester ou mis de côté, ou ceux d'une étiquette, supposait de tout parcourir.
- **Décision** : une ligne de pastilles de statut (« Gardés », « À tester », « Plus tard », un toucher pour choisir, à nouveau pour lâcher) et une ligne d'étiquettes portées par au moins un lien. « Tous » remet le type, le statut et l'étiquette à zéro.
- **Web** : la page Liens filtre déjà par statut et étiquette, dans deux listes déroulantes ; même filtre, autre contrôle.

### 2026-11-01 — Synchronisation : appareils et conflits du serveur

- **Problème** : Réglages › Synchronisation ne montrait que les conflits perdus par le téléphone ; ni les appareils, ni les pertes des autres appareils (que le web montrait déjà).
- **Décision** : en ligne, la section lit `GET /api/v1/sync/status`. « Appareils » : nom · « Synchronisé il y a 2 h ». « Conflits » : d'abord ceux du serveur (« Écartée : … », « Gardée : … », « Garder cette valeur » / « Garder l'autre », « Compris » seul pour une habitude), réglés par `POST /api/v1/sync/conflicts/:id/resolve` ; puis ceux que seul le téléphone connaît (« Ce téléphone » / « Serveur »). Un même champ (`entité|uid|champ`) ne donne qu'une ligne, celle du serveur, et la régler efface aussi la copie du téléphone. Hors ligne : la liste du téléphone seule.
- **Web** : rien à reprendre (la page web fait déjà de même). Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — En-tête de projet et compteurs à zéro (reprise du web)

- **Problème** : règles d'épure du web du 2026-11-01 (en-tête de projet, pas de compteur 0) à vérifier sur Android.
- **Décision** : l'en-tête d'un projet gagne un menu « … » avec « Épingler / Désépingler » (`pin_to_sidebar`, synchronisé ; `TaskRepository.setProjectPinned`), rien en bouton visible. Android n'affiche pas l'échéance d'un projet (`due_date_at` n'est pas gardé dans Room) : aucune couleur d'alerte possible. L'Inbox vide n'a plus de sous-titre « 0 idée à trier » ; Aujourd'hui n'a pas de pastilles de filtre Boîte / Tout (les compteurs de la planification ne s'affichent déjà que non nuls).
- **Web** : rien à reprendre. Reste : afficher l'échéance d'un projet sur Android demanderait une colonne Room et une migration ; rien d'essayé sur le téléphone.

### 2026-11-01 — « Rattacher » sur la carte de lien de l'Inbox

- **Problème** : le web propose « Rattacher » dans l'Inbox et sur `/links` ; Android ne l'offrait que dans la galerie des découvertes, la carte de lien de l'Inbox gardait quatre décisions.
- **Décision** : la carte de lien de l'Inbox a cinq pastilles, dans l'ordre du web : Garder, À tester, Rattacher, Plus tard, Jeter (`LinkTriage.inboxDecisions`). « Rattacher » n'apparaît que s'il existe un projet ouvert ; il ouvre « Rattacher à quel projet ? » sans « Sans projet », puis crée une tâche au nom du lien (adresse puis note), garde le lien et traite l'idée, après la fenêtre « Annuler » de 4,5 s. Le tri en série « Trier les liens » garde ses quatre boutons.
- **Web** : rien à reprendre. Reste : rien d'essayé sur le téléphone.

### 2026-11-01 — Aujourd'hui lit le plan du jour du serveur

- **Problème** : une tâche placée dans le plan du jour (à 16:30 sur le web, ou sans heure par la « Session courte » de la revue) sonnait sur le téléphone mais n'apparaissait pas dans son Aujourd'hui, qui ne calcule que l'échéance et le statut.
- **Décision** : la dernière lecture du plan (aujourd'hui, demain, gardée sur l'appareil après chaque synchro) s'ajoute à Aujourd'hui : chaque tâche ouverte du plan une seule fois, à l'heure du plan (heure montrée sur la ligne, avant l'échéance) ou dans la partie sans heure ; une tâche en retard placée aujourd'hui passe du retard au jour. Un placement à heure occupe son créneau dans « Planifier la journée » et n'est plus à placer. Le reste de la planification d'Android ne change pas ; le téléphone n'écrit pas le plan (sauf la session courte). Le widget Aujourd'hui ne lit pas encore le plan.
- **Web** : rien à reprendre (le web lit déjà son plan). Reste : rien d'essayé sur le téléphone.

### 2026-11-04 — Cocher une fois passé, agenda par agenda

- **Problème** : les événements passés d'un agenda restaient à cocher un par un dans Tâches, Agenda et le widget.
- **Décision** : chaque agenda (Réglages › Agendas) a une puce « Cocher une fois passé », coupée par défaut. Une occurrence terminée (journée entière : à minuit) est montrée faite partout, sans rien enregistrer ni toucher au fournisseur ; « Masquer les événements faits » la masque, sans « Cocher un événement » rien n'est coché. La liste se met à jour chaque minute. Tant que la puce est active, une occurrence passée ne se décoche pas.
- **Web** : rien à reprendre, le web n'a pas d'événements cochables. Reste : rien d'essayé sur le téléphone.

### 2026-11-05 — Bilan du soir : plus de choix par tâche

- **Problème** : le bilan du soir n'offrait que « Reporter à demain » ; une tâche qui glisse se décale, se range ou s'abandonne aussi.
- **Décision** : chaque tâche du soir et chaque tâche qui a glissé garde sa case et gagne un bouton « … » : Demain (ajout au plan de demain, échéance inchangée), Choisir une date (feuille de date, échéance écrite), Plus tard (étiquette `#someday`), Abandonner (statut annulé). La ligne le dit aussitôt (« Demain », « Échéance : jeu 6 », « Plus tard », « Abandonnée » barrée) et le message « Annuler » rend l'état d'avant (ancienne échéance, étiquette retirée, ancien statut, tâche retirée du plan de demain ou appel retiré de la file). « Bruit » devient « Pas utile » ; la carte répond « Tu verras moins ce type d'alerte » (valeurs `useful` / `noise` inchangées).
- **Web** : à reprendre pareil (contrat dans `docs/39-daily-brief.md`, « Evening review »). Reste : rien d'essayé sur le téléphone.

### 2026-11-07 — Agenda : toucher une tâche ouvre sa fiche

- **Problème** : dans l'Agenda, toucher une tâche (bloc horaire, journée entière, liste) ne faisait rien ; seule sa case réagissait.
- **Décision** : toucher le corps d'une tâche ouvre sa fiche, la même que dans Tâches, par-dessus l'Agenda ; une occurrence à venir ouvre la tâche enregistrée de sa série. La case coche toujours, l'appui long glisse toujours.
- **Web** : rien à reprendre, le calendrier web ouvre déjà la tâche. Reste : rien d'essayé sur le téléphone.

### 2026-11-12 — Tâche de fichier TODO.md : le reste s'édite

- **Problème** : une tâche qui vient d'un `TODO.md` était figée (seule la case) ; impossible de la dater, la prioriser ou l'étiqueter depuis Cadence.
- **Décision** : titre, note, projet et suppression restent au fichier (la suppression = retirer la ligne) ; tout le reste s'édite comme une tâche ordinaire, dans la fiche, les balayages et le menu. Le bandeau dit que titre et note viennent du fichier ; le badge « TODO.md » reste. Sous-tâches : toujours pas. Lecture : `swipe/FileBackedActions.kt`.
- **Web** : déjà pareil (bbcdba68, même règle `FILE_OWNED_TASK_FIELDS` côté serveur). Reste : rien d'essayé sur le téléphone.

### 2026-11-14 — Aujourd'hui allégé

- **Problème** : l'écran Aujourd'hui donnait l'impression d'être débordé : gros bouton « Planifier ma semaine » en tête, sept replis sous la journée (Demain, Cette semaine, Semaine prochaine, Ce mois-ci, Mois prochain, Un jour, Suggérées) avec leurs comptes, une poignée bien visible sur chaque ligne.
- **Décision** : Aujourd'hui ne parle que de la journée. « Planifier ma semaine » reste dans Planifier ; sous la journée, seuls Demain et Suggérées, repliés ; les horizons vivent dans Planifier ; la poignée de rangement passe à 35 % d'opacité (1.37.0).
- **Web** : déjà sans replis d'horizons ; reste le repli « Demain » (`TODO.md` › Now). Le bouton de la semaine reste dans l'en-tête d'Aujourd'hui du web (petit bouton secondaire, pas une carte). Reste : rien d'essayé sur le téléphone (non branché), vérifié sur l'émulateur.

### 2026-11-14 — Replanifier les échues d'un toucher

- **Problème** : le matin, trier les échues demandait d'aller dans Planifier ou d'ouvrir chaque fiche.
- **Décision** : « Replanifier » sur l'en-tête « Échues » d'Aujourd'hui ouvre une feuille : chaque échue avec Aujourd'hui, Demain, Semaine pro., Plus tard, Abandonner (une série : Passer cette fois). Un toucher écrit tout de suite, la ligne garde son choix et « Annuler ». Une échue replacée n'est plus échue (jour = échéance, horizon = échéance vidée), comme la semaine proposée. Le bouton de la semaine devient « Planifier ma semaine (IA) » (web aussi).
- **Web** : à reprendre (`TODO.md` › Now). Reste : vérifié sur l'émulateur, pas sur le téléphone.

