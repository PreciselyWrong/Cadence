# Prise en main

Cadence range vos tâches, projets, habitudes, notes et captures au même endroit, sur le web, sur Android et sur Linux, avec une interface calme qui fonctionne aussi sans réseau. Cette page explique comment se connecter, quels clients installer et comment se repérer dans le vocabulaire avant de lire le reste du wiki.

![Aujourd'hui, vue du jour et calendrier](images/web/today.png)

## Les clients disponibles

Tous les clients parlent au même serveur : ce que vous faites sur l'un apparaît sur les autres.

| Client | Pour quoi faire | Comment l'obtenir |
|---|---|---|
| **Web** (application installable) | L'application complète, utilisable hors ligne | Ouvrir l'adresse de votre serveur (par exemple `https://cadence.example.com`) dans un navigateur |
| **Android** | Tâches, plan, habitudes, notes, bilan, widgets, rappels | Installer l'APK fourni par la personne qui gère votre serveur, ou le compiler depuis le dépôt (voir [Android](Android)) |
| **Linux** | La fenêtre web avec icône dans la barre système, ajout rapide au clavier, notifications natives | Paquet RPM ou AppImage (voir [Client Linux et Firefox](Client-Linux-et-Firefox)) |
| **Add-on Firefox** | Envoyer la page ouverte ou un lien vers Cadence | Extension signée hors catalogue public (voir [Client Linux et Firefox](Client-Linux-et-Firefox)) |

Il n'y a pas de boutique d'applications : le serveur est le vôtre, ou celui de quelqu'un qui vous y a invité. L'installation du serveur est décrite dans [Auto-hébergement](Auto-hebergement).

### Installer la version web comme une application

Le site s'installe comme une application (PWA) : il s'ouvre dans sa propre fenêtre, sans barre d'adresse.

| Navigateur | Geste |
|---|---|
| Chrome ou Edge (ordinateur, Android) | Icône d'installation dans la barre d'adresse, ou menu ⋮ › « Installer l'application » |
| Safari (iPhone, iPad, iOS 16.4 ou plus) | Bouton Partager › « Sur l'écran d'accueil » |
| Firefox (Android) | Menu ⋮ › « Installer » |

L'installation demande une adresse en HTTPS (sauf en local). Une fois installée, l'application apparaît aussi dans la feuille de partage du système sur Android et dans Chrome ou Edge sur ordinateur : voir [Boîte de réception et capture](Boite-de-reception-et-capture).

## Compte et connexion

### Créer un compte

- **L'inscription libre est désactivée par défaut.** C'est l'administrateur du serveur qui l'ouvre ou qui crée les comptes à la main.
- **Le premier compte créé devient administrateur.** Les suivants sont des utilisateurs ordinaires.
- Quand l'inscription est ouverte, l'adresse e-mail doit être valide, unique et d'un domaine qui peut recevoir du courrier (les adresses jetables sont refusées). Le mot de passe fait au moins 8 caractères.
- Un e-mail de vérification contient un lien valable 24 heures. Tant qu'il n'est pas cliqué, la connexion est refusée ; la page de connexion permet de redemander un lien. Si le serveur ne peut pas envoyer le courrier, l'inscription échoue sans rien créer : vous pouvez simplement réessayer plus tard.

### Se connecter

- Connexion par e-mail et mot de passe. Un message d'erreur reste volontairement vague (« identifiants invalides ») pour ne rien révéler.
- Vous pouvez être connecté sur plusieurs appareils en même temps ; la session dure jusqu'à la déconnexion ou son expiration.
- Si l'administrateur a configuré un fournisseur d'identité (OIDC/SSO), un bouton de connexion unique apparaît sur la page de connexion.
- **Double authentification (facultative).** Profil › Accès › Sécurité : scanner le code QR avec une application d'authentification, saisir un code, puis conserver les 10 codes de secours affichés une seule fois. Ensuite la connexion demande un code à 6 chiffres après le mot de passe, ou un code de secours (chacun ne sert qu'une fois). Cinq codes faux de suite obligent à ressaisir le mot de passe. En cas de perte du téléphone et des codes, l'administrateur peut réinitialiser la double authentification.

### Clés API

Profil › Accès › Clés API crée des clés personnelles qui commencent par `tt_`. Elles servent à connecter l'application Android (un code QR est affiché sous la clé), le client Linux, l'add-on Firefox et les intégrations. La clé complète n'est montrée qu'une fois : copiez-la tout de suite et ne la partagez pas (dans ce wiki elle est notée `<jeton>`). Une clé se révoque à tout moment, et elle peut avoir une date d'expiration.

## Où trouver les réglages

La page « Paramètres du profil » s'ouvre depuis le menu utilisateur (« Profil »). Sa navigation est groupée :

| Groupe | Rubriques |
|---|---|
| Compte | Général, Forfait et facturation (serveurs hébergés seulement) |
| Interface | Apparence, Raccourcis, Barre latérale |
| Organisation | Préférences de notification, Calendriers, Planification, À trier, Classement |
| Intégrations | Telegram, Synchronisation, Synchronisation CalDAV, Intégration MCP, Agents, Plugins, Assistant IA |
| Accès | Sécurité, OIDC/SSO, Clés API |
| Avancé | Fonctionnalités et modules, Import et export |

Sur téléphone, la rubrique ouverte est une ligne qui déplie ce menu. Le wiki cite les réglages sous la forme « Profil › Groupe › Rubrique » ; sur Android, ils sont dans **Réglages** (engrenage en haut à droite de Tâches, Agenda, Habitudes et Bilan).

### Langue, fuseau horaire, premier jour de la semaine

Dans Profil › Compte › Général : **Langue** (26 langues, appliquée immédiatement), **Fuseau horaire** et **Premier jour de la semaine**. Le fuseau compte beaucoup : « aujourd'hui », les heures des rappels et les échéances sans heure se calculent dedans. Si vous voyez une tâche « due hier » à minuit, c'est le premier endroit à vérifier. L'application Android lit ces réglages depuis le serveur.

### Apparence

Profil › Interface › Apparence :

- **Thème** : clair, sombre (avec l'option **Noir pur en mode sombre**) ou celui du système.
- **Couleur d'accent** : huit teintes (Violet, Indigo, Bleu, Sarcelle, Vert, Ambre, Corail, Rose) ou une couleur libre en hexadécimal.
- **Interface** : **Minimale** (par défaut) ou **Dense**. Minimale masque le superflu pour une liste calme ; Dense montre toutes les commandes. Rien n'est supprimé en passant de l'une à l'autre. Presque tout le wiki décrit la version Minimale.
- **Détails de la ligne de tâche** : en Minimale, vous choisissez les puces affichées à droite d'une ligne de tâche (récurrence, commentaires, étiquettes, projet, drapeau de priorité, échéance) et leur ordre.

La police est Inter, la même palette que l'application Android. Les contrastes respectent le niveau AA, les cibles tactiles font 44 px et le texte ne descend pas sous 12 px.

## Le vocabulaire en dix mots

| Mot | Ce que c'est |
|---|---|
| **Tâche** | Une chose à faire. Elle n'a besoin que d'un nom ; tout le reste (échéance, projet, priorité) est facultatif. Voir [Tâches](Taches). |
| **Sous-tâche** | Une étape d'une tâche, sur un seul niveau de profondeur. |
| **Projet** | Un ensemble de tâches avec un but, qui peut contenir des sous-projets. Voir [Projets et domaines](Projets-et-domaines). |
| **Zone** (Android : **domaine**) | Un grand secteur de vie, comme Maison, Travail ou Santé. Il regroupe des projets, des objectifs et des tâches. |
| **Objectif** | Un résultat visé, avec des résultats clés qui se mesurent aux tâches faites. Voir [Objectifs](Objectifs). |
| **Habitude** | Une routine suivie jour après jour, avec série et valeurs. Voir [Habitudes](Habitudes). |
| **Note** | Un texte en Markdown, éditable comme un plan. Voir [Notes et outliner](Notes-et-outliner). |
| **Étiquette** (tag) | Un mot-clé, éventuellement imbriqué (`perso/sport`). Voir [Tags, vues et navigation](Tags-vues-et-navigation). |
| **Idée** | Un élément de la boîte de réception, pas encore trié. Voir [Boîte de réception et capture](Boite-de-reception-et-capture). |
| **Plan** (« Planifier ») | La page qui répartit les tâches sur les jours et les horizons. Voir [Aujourd'hui et plan du jour](Aujourd-hui-et-plan-du-jour). |

Trois idées structurent tout le reste.

1. **L'échéance n'est pas le jour prévu.** L'échéance est « à terminer pour ». Le jour prévu est celui où vous comptez vous en occuper. Déplacer une tâche dans Aujourd'hui ou Planifier change le jour prévu, jamais l'échéance (sauf si vous activez l'option « Planifier change l'échéance » dans Profil › Organisation › Planification).
2. **Pas de culpabilité.** Cadence n'annonce jamais qu'une tâche est « en retard » par une notification et n'affiche pas de compteur de jours de retard. Les tâches échues se replanifient en un geste. Voir [Notifications et rappels](Notifications-et-rappels).
3. **Le hors ligne d'abord.** Chaque client continue de marcher sans serveur et se resynchronise ensuite ; en cas de modification simultanée, les champs sont fusionnés un par un. Voir [Hors ligne et synchronisation](Hors-ligne-et-synchronisation).

## Votre premier quart d'heure

1. **Capturez** sans réfléchir : appuyez sur `c` (ou sur le bouton « Capturer » de la barre du haut), tapez `Appeler le plombier demain 14h #maison !2` et validez. Voir [Boîte de réception et capture](Boite-de-reception-et-capture).
2. **Ouvrez Aujourd'hui** : la tâche y apparaît le jour dit, avec son heure sur le calendrier à droite.
3. **Regardez Planifier** : la colonne de gauche liste ce qui n'a pas encore de jour ; glissez une carte sur un jour.
4. **Essayez la palette** : `Ctrl+K` (ou `Cmd+K` sur Mac) trouve une page, une tâche, un projet ou lance une commande.
5. **Connectez votre téléphone** : créez une clé dans Profil › Accès › Clés API et scannez le code QR avec l'application Android.
6. **Réglez le fuseau et la langue** dans Profil › Compte › Général.

### La page de bienvenue

À la toute première visite d'un compte, une page de bienvenue (une courte vidéo et un bouton pour commencer) s'affiche avant tout le reste, y compris pour un compte déjà ancien : elle apparaît une seule fois, puis le bouton ouvre Aujourd'hui. Les pages vides proposent aussi des démarrages en un clic : pour les zones, « Maison », « Travail », « Santé » et « Famille » ; pour les habitudes, une marche le matin, vingt minutes de lecture et une revue hebdomadaire (la nouvelle habitude s'ouvre pour régler son rythme).

## Cas particuliers

| Situation | Ce qui se passe |
|---|---|
| Vous n'avez pas encore de serveur joignable | Le client web installé et l'application Android s'ouvrent quand même avec les données déjà chargées ; vos modifications attendent la reconnexion |
| Vous changez de langue | Le changement est immédiat ; une clé non traduite dans une langue s'affiche en anglais |
| Vous oubliez le mot de passe | Utilisez le lien de réinitialisation de la page de connexion s'il est activé sur votre serveur, sinon demandez à l'administrateur |
| Vous êtes sur une instance partagée | Chaque personne a ses propres étiquettes, vues et réglages ; seuls les projets se partagent (voir [Projets et domaines](Projets-et-domaines)) |
| Vous voulez une interface plus riche | Profil › Interface › Apparence › Interface › **Dense** |

## Pour aller plus loin

- [Gestion des utilisateurs, connexion et profil](https://github.com/PreciselyWrong/cadence/blob/main/docs/08-user-management.md)
- [Double authentification](https://github.com/PreciselyWrong/cadence/blob/main/docs/29-two-factor-sign-in.md)
- [Application installable (PWA)](https://github.com/PreciselyWrong/cadence/blob/main/docs/15-pwa.md)
- [Premier lancement](https://github.com/PreciselyWrong/cadence/blob/main/docs/24-onboarding.md)
- [Présentation du fork](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/FORK.md)
