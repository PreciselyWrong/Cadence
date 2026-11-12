# Refonte des liens : un lien est une tâche ou une page de projet

Proposition du 2026-11-12, à valider avant toute implémentation. Contrat actuel : `docs/37-links.md`.

## Constat

Deux usages réels, aucun servi par la bibliothèque actuelle :

- **Sur le téléphone : « une chose à essayer ».** 7 liens capturés, tous par le partage Android. Chaque lien utile a fini en tâche « À regarder : <nom> » ; les autres sont restés « À voir » sans suite ; deux dépôts partagés hier attendent encore dans l'Inbox.
- **Sur l'ordinateur : « des pages pour un projet ».** L'add-on Bookmark Tagger (projet à part, v3.3) est devenu un outil de recherche par projet : un groupe d'onglets Firefox = un projet, ses onglets ouverts à côté des pages enregistrées, pause et reprise. Ces projets ne sont pas ceux de Cadence.
- **Aucun lien « juste à garder »** : 0 lien dans un projet Cadence, 1 étiqueté ; la bibliothèque contient surtout des déchets (9 archivés sur 15) et des résumés automatiques écrits dans la note de l'utilisateur.

Lecture : le lien n'est pas un objet à gérer. C'est soit **une action** (essayer, lire, regarder), soit **une page au service d'un projet**. Le système actuel force à gérer un troisième objet (le lien de la bibliothèque) avec ses statuts, étiquettes, revue et thèmes, et un choix « Tâche ou Liens » à chaque partage. Chaque couche ajoutée a soigné un symptôme de ce troisième objet.

## Ce que font les plus directs

| Outil | Geste → résultat |
|---|---|
| Todoist | « Ajouter le site comme tâche » (extension) : titre de la page + adresse deviennent le nom de la tâche. Aucun objet lien. (doc) |
| Things 3 | Saisie rapide avec remplissage auto (Mac) : l'adresse va dans les notes de la tâche, on tape le titre. (doc) |
| Rappels (Apple) | Champ adresse dans le détail d'un rappel, petit aperçu dans la liste. (article MacRumors) |
| Sunsama | « Ajouter par adresse » : l'adresse collée devient une tâche, titre traduit pour les services connus. (doc) |
| PARA (Forte) | Un projet rassemble ses ressources ; une ressource sans projet est un sujet, pas une action. (méthode) |
| Readwise Reader | À l'inverse, un vrai lecteur : il faut tout un système de tri (Inbox / Plus tard / Archivé). Utile pour lire beaucoup, pas pour agir. (doc) |

Les gestionnaires de tâches les plus fluides n'ont **pas** de bibliothèque de liens : la tâche *est* le lien. Aucun ne transforme nativement une tâche en projet (Todoist passe par une intégration tierce).

## Repris de Bookmark Tagger

Ce qui marche déjà chez toi et passe dans Cadence :

| Idée | Dans Cadence |
|---|---|
| Un projet = ses onglets ouverts + ses pages enregistrées | Section **Pages** d'un projet ; add-on : « Envoyer au projet » (l'onglet, ou tous les onglets du groupe), « Ouvrir le projet » (ses pages dans un groupe d'onglets nommé comme lui) |
| Enregistrer en un clic, l'enrichissement suit en arrière-plan | Déjà la règle (`jobs.js`) ; vaut pour la tâche comme pour la page |
| « Déjà enregistré » dit où, avec des boutons | Partager une adresse déjà dans une tâche ouverte ou un projet : « Déjà dans <tâche/projet> », Ouvrir ou Ajouter quand même |
| Doublons signalés, jamais fusionnés en silence | Même adresse normalisée = même page dans un projet ; une deuxième tâche est permise mais signalée |
| Projet sans activité depuis 30 jours rangé dans « Pas touché depuis 30 jours », avec « Garder » ; rien fermé ni supprimé | Même règle pour les projets Cadence (liste repliée en bas de Projets, revue hebdo) ; pas d'archivage automatique |
| Pause d'un projet : ses onglets fermés, repris plus tard | Statut « en pause » existant ; « Ouvrir le projet » les rouvre |
| Copier les liens en Markdown | ⋯ d'un projet : « Copier les pages en Markdown » |
| Liens morts vérifiés à la demande, jamais supprimés seuls | ⋯ d'un projet : « Vérifier les pages » (404/410, hôte injoignable ; 401/403 jamais morts) |
| Couleur du site sur la ligne | Carte d'aperçu teintée par la couleur de l'icône du site (plus tard) |
| Leçon : une liste d'étiquettes imposée à l'IA produisait des étiquettes fausses | Pas d'étiquetage IA des liens ; le classement automatique existant range la tâche comme toute tâche |

## Principe

**Un lien a deux maisons : une tâche (à faire) ou les pages d'un projet (pour avancer le projet).** Ce qui ne relève d'aucune des deux est une **note**. Plus de bibliothèque de liens à trier, classer ou revoir.

### Capture

- **Téléphone et Inbox** : partager ou trier une idée qui n'est qu'une adresse crée la tâche en un geste. Nom calculé (code, sans IA) : dépôt ou outil → « Essayer : … », article → « Lire : … », vidéo → « Regarder : … », autre → titre seul, modifiable avant d'enregistrer. L'adresse va dans la note ; la tâche arrive dans « Tâches à classer » avec « Quand ? ». Sur la même fiche, une ligne en dessous : **Projet…** (ajoute la page à un projet), **Note**, **Inbox**.
- **Add-on Firefox** : bouton = tâche (même règle) ; menu : **Envoyer au projet** (cet onglet ou tout le groupe), **Ouvrir le projet**. Raccourci clavier pour la tâche.

### Affichage

- **Carte d'aperçu** pour chaque adresse de la note d'une tâche, d'une note ou d'une description de projet : image, titre, site ; pour GitHub, étoiles, langage, dernière mise à jour. Android l'a déjà (`tasks/links/LinkPreviews.kt`) ; le web la reçoit dans le panneau de tâche.
- **Pages d'un projet** : liste compacte (icône, titre, site, note courte) sous les tâches du projet ; ⋯ par page : Créer une tâche (dans le projet, adresse en note), Modifier, Retirer.
- Les métadonnées viennent d'un **cache serveur par adresse** (lecture actuelle, garde SSRF, GitHub).

### Tâche → projet

« **Transformer en projet** » sur toute tâche : nom → nom du projet, note → description, sous-tâches → tâches du projet, adresses de la note → pages du projet, étiquettes suivent ; la tâche disparaît.

### La page Liens

Elle disparaît comme lieu à entretenir. À la place, un filtre « Avec un lien » dans les tâches (galerie possible), et les pages restent dans leurs projets.

## Données

- La table `links` devient **les pages des projets** : `project_id` obligatoire, une ligne par adresse et par projet ; gardent `url`, `title`, `note` (de l'utilisateur seulement), les métadonnées ; perdent `status`, `review_at`, les étiquettes, `source_*`.
- Cache d'aperçus par adresse, partagé par tâches, notes et pages.
- Synchro `link` simplifiée (pages : créer, titre, note, retirer, hors ligne compris) ; MCP : `add_project_page`, `list_project_pages`, et `create_task` qui accepte une adresse ; retrait de `group_links`, `propose_link_slot`, carte « Lien à revoir », thèmes par IA, résumé automatique des liens.

Reprise unique, SQLite et PostgreSQL :

- lien archivé → supprimé ;
- lien avec projet → page de ce projet ;
- lien « À voir » dont la tâche source existe → supprimé (la tâche porte l'adresse) ;
- autre lien « À voir » → tâche « Verbe : titre » dans « Tâches à classer », note de l'utilisateur conservée (sans « Résumé auto »), étiquettes reprises ;
- import de favoris (`bookmarks.html`) : un dossier = pages d'un projet choisi ou d'un nouveau projet.

## Étapes (web et Android dans la même étape)

1. **Capture directe** : partage Android, Inbox, add-on → tâche nommée par verbe, « Déjà dans … ». → vérif : un dépôt GitHub partagé depuis le téléphone = tâche « Essayer : … » en 1 toucher ; le repartager affiche « Déjà dans ».
2. **Aperçus partout** : cache serveur par adresse, carte dans le panneau de tâche web, notes et projets. → vérif : la tâche montre image, titre et étoiles, hors ligne compris sur Android.
3. **Pages de projet** : section Pages, « Projet… » à la capture, add-on « Envoyer au projet » / « Ouvrir le projet », Markdown, vérification des pages. → vérif : 5 onglets d'un groupe Firefox envoyés à un projet apparaissent sur le web et le téléphone ; « Ouvrir le projet » les rouvre dans un groupe.
4. **Transformer en projet** et rappel des projets dormants. → vérif : « Essayer : X » avec 2 sous-tâches et une adresse devient le projet X (2 tâches, 1 page).
5. **Retrait et reprise** : migration, retrait de la bibliothèque, des statuts, de la revue et des outils MCP, traductions, docs. → vérif : mise à niveau sur SQLite et PostgreSQL ; un ancien client Android ne casse pas la synchro.

## Questions ouvertes (tranchées le 2026-11-12)

1. Nom par verbe, calculé par le code (dépôt ou outil → « Essayer : … », article → « Lire : … », vidéo → « Regarder : … », autre → titre seul), modifiable avant d'enregistrer ; sans IA ; verbes traduits dans les 26 langues du web et dans les chaînes Android.
2. Bookmark Tagger reste à part. L'add-on Cadence (`integrations/firefox-addon/`) gagne seulement : bouton = tâche, menu « Envoyer au projet » (cet onglet ou tout le groupe) et « Ouvrir le projet » (ses pages dans un groupe d'onglets nommé comme le projet).
3. Un lien « juste à garder » est une note.

## Sources

- Todoist, extension navigateur : todoist.com/help/articles/use-the-todoist-extension-on-your-web-browser-EZERGsoH
- Things, saisie rapide avec remplissage : culturedcode.com/things/support/articles/2249437
- Rappels, champ adresse : macrumors.com/how-to/add-notes-urls-to-reminders-ios
- Sunsama, ajout par adresse : help.sunsama.com/docs/usage-guides/tasks/add-via-url
- Readwise Reader, états de tri : docs.readwise.io/reader/guides/workflows/library-configuration
- PARA (projets, ressources) : fortelabs.com/blog/para
- Bookmark Tagger : `README.md`, `docs/projects.md` du dépôt de l'add-on (v3.3)
