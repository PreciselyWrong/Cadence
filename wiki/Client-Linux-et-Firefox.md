# Client Linux et add-on Firefox

Deux petits outils pour capturer et rester prévenu depuis l'ordinateur : le **client Linux** (une coque Tauri 2 autour de l'interface web, avec icône de barre système, ajout rapide global et notifications natives) et l'**add-on Firefox** (une page ou un lien du navigateur devient une tâche Cadence en un clic).

## Client Linux

### Ce que c'est

Une application légère qui charge **votre propre serveur Cadence** dans une fenêtre : c'est l'interface web, inchangée (mêmes écrans, même session, mêmes 26 langues). Elle ajoute ce qu'un onglet de navigateur ne peut pas faire :

- une **icône dans la barre système** (le panneau, par exemple celui de KDE Plasma) qui reste là fenêtre fermée ;
- l'**ajout rapide global** : une petite zone de saisie appelée par un raccourci clavier, depuis n'importe quelle application ;
- des **notifications natives** du système (les rappels de tâches, avec leurs boutons) ;
- un fonctionnement **hors ligne**.

La fenêtre n'a pas de barre de titre système : les boutons Réduire, Agrandir et Fermer sont dessinés dans la barre du haut de l'interface web, qui sert aussi de zone de déplacement (double-clic : agrandir ou restaurer). Les liens, boutons et champs de cette barre gardent leur clic.

### Installer

Le client se compile depuis `desktop/` et produit un **RPM** et un **AppImage** :

```bash
cd desktop
npm install
npm run build        # RPM + AppImage dans src-tauri/target/release/bundle/
```

Sous Fedora, les paquets de développement nécessaires sont `webkit2gtk4.1-devel`, `libappindicator-gtk3-devel`, `librsvg2-devel`, `openssl-devel` et `rpm-build`. Sur une machine chargée, `CARGO_BUILD_JOBS=6 npm run build` limite la charge. Installez ensuite le RPM (recommandé : il installe aussi une entrée de bureau cachée dont le portail de raccourcis a besoin pour nommer l'application) ou lancez l'AppImage.

### Première ouverture

Une fenêtre **Réglages Cadence** demande :

| Champ | Rôle |
|---|---|
| **Adresse du serveur** | « Celle que vous ouvrez dans le navigateur » (par exemple `https://cadence.example.com`). Un lien vers un autre site que ce serveur s'ouvre dans votre navigateur par défaut, pas dans la fenêtre. Mettez l'adresse **finale** : si le serveur redirige vers une autre origine, ses pages comptent comme externes. |
| **Clé API** | Une clé `tt_...` créée dans Profil › Clés API. Nécessaire pour l'ajout rapide et les notifications ; sans elle la fenêtre web marche, mais l'ajout rapide et les notifications restent inactifs. |
| **Raccourci global** | `Ctrl+Alt+Space` par défaut. |
| **Lancer Cadence à l'ouverture de session** | Désactivé par défaut. Démarre dans la barre système, sans fenêtre. |

Ces valeurs sont aussi dans `~/.config/ch.nicolab.cadence.desktop/config.json`, modifiable à la main (relu en 2 secondes). La clé est dans un fichier à droits restreints (0600), pas dans le trousseau du système.

### L'icône de la barre système

- **Clic gauche** : ouvre les tâches du jour (`/today`).
- **Clic droit** : le menu **Ouvrir**, **Ajout rapide**, **Réglages**, **Quitter**.
- Fermer la fenêtre **laisse l'application tourner** dans la barre. Au repos, le processus de la barre pèse environ 60 Mo ; chaque fenêtre est un processus séparé qui disparaît à sa fermeture (la mémoire est rendue).
- Sous GNOME, il faut l'extension « AppIndicator » pour voir l'icône. Sans hôte de barre système, l'application continue de tourner et réessaie.

### Ajout rapide

`Ctrl+Alt+Space` (ou le raccourci que vous avez choisi) ouvre une petite zone de saisie toujours au premier plan (560 × 76 px) : « Capturer dans la boîte de réception, puis Entrée ». **Entrée** enregistre et ferme ; Échap annule. La capture arrive dans la **boîte de réception** avec la source « desktop ». Le même raccourci se retrouve en lançant `cadence-desktop --quick` : on peut donc l'affecter dans les raccourcis du bureau.

**Raccourci sous KDE Plasma et Wayland.** Sous Wayland, une application ne peut pas saisir une touche globale elle-même : Cadence la déclare au **portail de raccourcis** du bureau (XDG GlobalShortcuts), qui vous demande de confirmer la touche au premier lancement, puis en reste propriétaire. Pour changer la touche ensuite, passez par les réglages de raccourcis du bureau (Cadence y apparaît), pas par le fichier de configuration (c'est seulement une première suggestion).

| Situation | Résultat |
|---|---|
| Une autre application tient déjà la touche (par exemple `Ctrl+Alt+Space`) | L'action est créée **sans touche** : choisissez-en une dans les raccourcis du bureau |
| Le portail est absent | Cadence essaie la capture de touche X11 |
| Le raccourci ne réagit pas | Installez le RPM, ou, avec l'AppImage, placez un `ch.nicolab.cadence.desktop.desktop` dans `~/.local/share/applications` ; ou affectez `cadence-desktop --quick` à une touche dans les raccourcis du bureau, ce qui marche partout |
| Plusieurs lancements | Un second lancement transmet ses options au processus déjà en cours : sans `--quick`, il ouvre la fenêtre principale ou, si elle est déjà ouverte, la ramène au premier plan |

### Captures hors ligne

Les captures de l'ajout rapide sont gardées dans une file locale (un petit fichier par capture) puis envoyées à la boîte de réception dès que possible, et toutes les **60 secondes** tant que le serveur est injoignable. Chaque capture porte une **clé anti-doublon** identique à chaque nouvel essai : si une réponse s'est perdue, le serveur ne crée pas deux idées. (Un serveur qui ignorerait cette clé pourrait encore dupliquer après une réponse perdue.)

### Fenêtre principale hors ligne

La fenêtre est une vue web sur votre serveur : elle enregistre le même **service worker** que le navigateur. Si le serveur est injoignable à l'ouverture, la coque en cache s'ouvre ; les modifications sont mises en file et rejouées au retour du serveur, avec les conflits éventuels visibles dans la pastille « Conflits : N » (voir [Hors-ligne-et-synchronisation](Hors-ligne-et-synchronisation)). Chaque écran doit avoir été ouvert une fois en ligne pour exister hors ligne.

### Notifications natives

Le processus de la barre système écoute le serveur (un flux en direct, avec une interrogation de secours toutes les 60 secondes) et affiche, **même fenêtre fermée**, ce que le serveur a routé vers le canal **Ordinateur** : rappels de tâches, tâches à heure fixe, habitudes, tâches de nouveau disponibles, messages d'agents, etc.

| Notification | Contenu | Boutons |
|---|---|---|
| Rappel de tâche | Le nom de la tâche, puis une ligne `Rappel · 14:30 · Projet · 25 min`, la première ligne de la note en italique, un anneau à la couleur du projet | **Terminé**, **+10 min**, **Ouvrir** |
| Habitude | Le nom de l'habitude | **+10 min** |
| Commentaire, autres | Le titre et le message du serveur | **Ouvrir** |

- **Une seule fois** par notification (l'application retient les 500 dernières) ; les heures calmes de votre compte sont respectées (une notification retenue part à leur fin).
- Un clic sur la notification (ou **Ouvrir**) ouvre la fenêtre principale **sur la tâche**, ou redirige la fenêtre déjà ouverte.
- **Terminé** coche la tâche directement depuis la notification, avec une clé anti-doublon (renvoyée telle quelle en cas de nouvel essai, et non renvoyée si le serveur refuse).
- **+10 min** repousse le rappel de dix minutes, localement.
- Trois boutons au plus, car GNOME n'en montre pas davantage.
- Dans l'interface web du client, la **cloche disparaît** : les notifications natives la remplacent. Profil › Notifications affiche une carte « **Notifications de cette app** » (avec un bouton de test du canal Ordinateur) à la place de la carte de notification du navigateur. Choisissez les types dans la colonne « Ordinateur ».

### Autres détails

- **Recharger** : F5, Ctrl+R et Ctrl+Maj+R rechargent la fenêtre (le moteur WebKit n'a pas de raccourci par défaut).
- **Liens externes** : un lien vers un autre site, `mailto:` ou `tel:` s'ouvre dans l'application du bureau par défaut ; les autres schémas (`file:`, `javascript:`) sont ignorés par sécurité. La connexion par un autre fournisseur (OIDC, Google) fonctionne.
- Les textes des écrans locaux (Réglages et ajout rapide) existent en français et en anglais seulement, pas dans les 26 langues du web.
- Si deux fenêtres sont ouvertes en même temps (fenêtre principale et ajout rapide), la mémoire monte (environ 430 Mo pour la fenêtre principale) et redescend à leur fermeture.

## Add-on Firefox

### À quoi il sert

Il fait de la **page ouverte** ou d'un **lien** une tâche Cadence. Le serveur nomme la tâche selon le genre de page (« Essayer : ... », « Lire : ... », « Regarder : ... », voir [Taches](Taches) pour les liens). Il ne contient aucune IA et n'a pas de marque-pages à lui.

Prérequis : Firefox 139 ou plus récent, un serveur Cadence, une clé API.

### Installer

L'add-on est **non listé** : privé, jamais publié sur le catalogue public de Mozilla. Deux voies :

1. **Pour essayer** : `about:debugging` › Ce Firefox › « Charger un module complémentaire temporaire » › le fichier `manifest.json` du dossier `integrations/firefox-addon/`. Il disparaît à la fermeture du navigateur.
2. **Installation permanente** : le paquet doit être **signé par Mozilla** (non listé). Avec vos clés de développeur, `integrations/firefox-addon/sign.sh` produit le fichier `.xpi` ; ouvrez-le dans Firefox. Augmentez `version` dans `manifest.json` avant chaque nouvelle signature.

### Réglages

Bouton de la barre d'outils › **Réglages** (s'ouvre dans un onglet) :

| Champ | Rôle |
|---|---|
| **Adresse du serveur Cadence** | `https` obligatoire (`http` seulement sur un réseau privé) |
| **Jeton d'API** | Créé dans Cadence : Profil › Clés API |

Au premier enregistrement, Firefox demande l'**autorisation d'accéder à ce serveur** : sans elle, l'extension ne peut pas le joindre (« Sans cette autorisation, l'extension ne peut pas joindre le serveur. »). Les requêtes n'envoient **que le jeton**, jamais la session Cadence du navigateur ; l'add-on n'a accès qu'à ce serveur et ne lit aucune page, sauf l'onglet que vous enregistrez, et Gmail pour son bouton.

### Créer une tâche

- **Bouton de la barre d'outils**, ou **Alt+Maj+K** : une fenêtre propose le **nom de la tâche** (modifiable), une **échéance** facultative (**Aujourd'hui** ou **Demain**, bascules), puis **Créer la tâche**. La tâche arrive dans « Tâches à classer » (« Tâche créée dans « Tâches à classer ». ») ou, avec une date, directement datée.
- **« Déjà dans « ... » »** : si l'adresse est déjà dans une tâche ouverte ou dans les pages d'un projet, la fenêtre le dit, avec **Ouvrir** ; **Ajouter quand même** passe outre.
- **Clic droit** sur une page ou sur un lien : « Créer une tâche dans Cadence » / « Créer une tâche de ce lien » : une tâche en un clic, l'icône affiche une marque en confirmation.

### Gmail

Dans Gmail, l'add-on ajoute un bouton **« + »** à côté d'Archiver et Supprimer sur chaque ligne de la liste (visible au survol, il ouvre la fenêtre sans ouvrir le mail) et un bouton **« + Cadence »** près de l'objet d'un message ouvert. Une petite fenêtre s'ouvre par-dessus Gmail : le nom vient de l'objet, avec les choix Aujourd'hui / Demain. La tâche garde l'adresse du message et porte le badge d'origine « Gmail ».

### Envoyer vers un projet

Dans la fenêtre : **choisir un projet** (rien n'est choisi tant que vous n'en prenez pas un ; la tâche du haut, elle, ne va jamais dans un projet). Trois boutons :

- **Envoyer au projet** : ajoute l'onglet courant aux **pages** du projet ;
- **Envoyer le groupe** : ajoute **tous les onglets** de son groupe d'onglets Firefox (le bouton n'apparaît que dans un groupe) ;
- **Ouvrir le projet** : ouvre les pages du projet dans un groupe d'onglets de même nom.

Le résultat dit « Pages ajoutées : N (déjà là : M) » ; un projet sans page répond « Ce projet n'a pas encore de pages ».

### Cas particuliers

| Situation | Message |
|---|---|
| Serveur ou jeton non réglés | « Réglez d'abord le serveur et le jeton. » |
| Jeton refusé | « Jeton refusé : vérifiez les réglages. » |
| Serveur injoignable | « Serveur injoignable. Rien n'a été enregistré. » (aucune file hors ligne) |
| Page non enregistrable (page interne de Firefox, par exemple) | « Cette page ne peut pas être enregistrée. » |
| Adresse refusée par le serveur | « Cette adresse n'a pas été acceptée. » |

## Pour aller plus loin

- [Client Linux](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/DESKTOP.md) : décisions, limites, vérifications
- [Liens](https://github.com/PreciselyWrong/cadence/blob/main/docs/37-links.md) : ce que devient une adresse
- [Notifications](https://github.com/PreciselyWrong/cadence/blob/main/docs/36-notifications.md)
- Pages liées : [Hors-ligne-et-synchronisation](Hors-ligne-et-synchronisation), [Boite-de-reception-et-capture](Boite-de-reception-et-capture), [Notifications-et-rappels](Notifications-et-rappels), [Integrations-MCP-et-plugins](Integrations-MCP-et-plugins)
