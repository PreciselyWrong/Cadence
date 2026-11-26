# Android

L'application Android de Cadence est le compagnon de poche du serveur : capture en un geste, journée en un coup d'œil, widgets, rappels, agenda du téléphone et habitudes, le tout utilisable sans réseau puis synchronisé avec votre serveur. Le PC sert surtout à planifier la semaine ; le téléphone sert à vivre la journée.

## Installer et connecter

**Prérequis** : Android 8.0 ou plus récent. L'application est un paquet APK installé « à la main » (hors boutique) : autorisez l'installation depuis la source qui vous l'a fourni (navigateur, gestionnaire de fichiers, catalogue privé), puis ouvrez-le. Pour la compiler vous-même : `android/dev.sh` (Linux) ou `android/dev.ps1` (Windows) construit le paquet de debug, l'installe sur le premier appareil détecté par ADB et l'ouvre (JDK 21 et SDK Android requis ; `--dummy` charge des données de démonstration).

**Se connecter à votre serveur**

1. Sur le web : Profil › **Clés API**, créez une clé (le nom est libre, par exemple « Téléphone »). L'écran peut afficher un **code QR « pour connecter un appareil »**.
2. Sur le téléphone : Réglages › Données › **Compte Cadence** › « Scanner le code QR » (un code qui ne vient pas de Cadence est refusé : « Ce code QR ne vient pas de Cadence. »), ou saisissez l'**adresse du serveur** (celle que vous ouvrez dans le navigateur) et la clé, puis « Se connecter ».
3. Le téléphone télécharge une copie complète de vos données (voir [Hors-ligne-et-synchronisation](Hors-ligne-et-synchronisation)), puis reste à jour tout seul.

**Se déconnecter** (même écran) efface les données synchronisées de l'appareil : l'application le dit avant de le faire. Les habitudes d'un autre compte ne sont jamais envoyées au nouveau : l'app propose de les garder sur le téléphone seulement, ou de les supprimer.

## Naviguer

Une **barre flottante translucide** à cinq cibles : **Inbox · Tâches · Agenda · Habitudes · Bilan**. « Tâches » est l'écran d'ouverture. Un engrenage en haut à droite de chaque onglet ouvre les **Réglages**. L'ajout se fait toujours par le bouton rond « + » en bas à droite, jamais par un bouton d'en-tête.

L'apparence (Réglages › Personnalisation › **Apparence**) : thème Système, Clair ou Sombre (avec « Noir pur en sombre » pour les écrans OLED), couleur d'accent parmi Violet (défaut), Indigo, Bleu, Sarcelle, Vert, Ambre, Corail, Rose, une couleur libre, ou **Material You** (Android 12 et plus, tiré du fond d'écran).

## Tâches

L'onglet **Tâches** n'a ni onglets ni rangées de filtres : le **titre est le sélecteur de liste** (« Aujourd'hui ▾ »). Toucher le titre ouvre une feuille avec vos projets et notes épinglés, puis Aujourd'hui, Planifier, Projets, Étiquettes, Notes, Terminées, le filtre de **zone**, et Réglages. Le sous-titre rappelle la date et la zone choisie.

### Aujourd'hui

- **Échues** en tête (en-tête d'erreur, « Voir les n »), puis la journée, puis la bande « Routine » des habitudes du moment (jusqu'à 5 habitudes à toucher pour saisir).
- Les **événements de votre agenda** sont mêlés aux tâches, par heure.
- **Journée vide** : « Journée bouclée » et un lien vers Demain. « Demain » et « Suggérées » restent repliables sous la liste ; une tâche sans date se retrouve.
- **Ma journée** : le matin, une carte propose de **planifier** (placement automatique dans vos heures libres, « Tout accepter » ou retirer une proposition ; rien n'est enregistré avant d'accepter). Le soir, une ligne propose de « Clore la journée » (« Reporter 3 à demain » ou « Laisser tel quel »).
- **Ranger au doigt** : une **poignée** à droite des tâches sans heure se tire verticalement pour les ordonner (l'ordre est celui du plan du jour, le même qu'au web). Un appui long puis glisser déplace n'importe quelle tâche d'Aujourd'hui : un trait et une étiquette disent où elle tombe (une heure, ou « À caser »). Une échue glissée dans la journée passe à aujourd'hui. Les événements de l'agenda du téléphone ne se déplacent pas.
- **Ma matinée** : quand l'IA a préparé la journée, une carte reste en haut d'Aujourd'hui (voir plus bas, « Le rituel du matin »).

### Planifier

Menu du titre › **Planifier**. La même page que le web, en une colonne :

- **Inbox** : « Tâches à classer » puis les idées ; « Ajouter » crée une tâche (une date nommée, ou une heure seule, la planifie ce jour-là).
- **Échues** avec « **Replanifier ▾** » : Aujourd'hui, Demain, **Étaler sur 7 jours**, Choisir une date. Ces gestes n'écrivent que le plan, jamais l'échéance.
- **14 jours** avec leur charge, ou les **horizons** (Cette semaine, Semaine prochaine, Ce mois-ci, Mois prochain, Un jour), et une bande « Plus tard » sous les 14 jours.
- Un **appui long** sur une tâche ouvre « Planifier » : un jour, un horizon, « Retirer de ce jour », ou le menu habituel. Une idée planifiée ainsi devient d'abord une tâche.
- Le plan des 14 jours est lu après chaque synchronisation et gardé sur l'appareil : la page marche hors ligne, chaque écriture part en file.

### Projets, étiquettes, notes, terminées

- **Projets** regroupés par zone, sans cartes ni barre de progression : pastille ou icône, nom, prochaine tâche, nombre d'ouvertes. « Pas touché depuis 30 jours » liste les projets dormants. Le statut d'un projet se change par son menu (Non commencé, Prévu, En cours, En attente, En pause, Terminé, Abandonné, Archivé) ; « En pause » les range dans le **Stash**. Les **sous-projets** s'affichent sur la page du parent ; un projet parent a une vue **Tableau** (une colonne par sous-projet en cours). Voir [Projets-et-domaines](Projets-et-domaines).
- **Étiquettes** en arbre repliable (filtrer par un parent inclut ses enfants), avec leurs icônes.
- **Notes** en grille de cartes, éditeur plein écran en plan (voir [Notes-et-outliner](Notes-et-outliner)) : une barre unique au-dessus du clavier propose décaler, monter, descendre, replier, zoomer, case à cocher, puis la mise en forme (gras, italique, titre, listes, lien, `[[`, `@`, tableau).
- **Terminées** : l'historique, avec « Rouvrir ».

### La ligne de tâche

Titre sur deux lignes, puis une ligne de méta (date et heure, projet dans sa couleur, tags). Une seule couleur compte : la couleur du projet ; une priorité haute se voit au contour rouge de la case carrée. Les événements d'agenda ont une case **ronde**, de la couleur de leur agenda.

**Appui long** : un menu unique, partout : Ouvrir, Terminer, Date, Priorité, Projet, Épingler, Dupliquer, Transformer en projet, Copier le lien ou le titre, Supprimer (avec « Annuler »), avec en tête les gestes propres à l'écran.

**Balayages configurables.** Réglages › Organisation › **Gestes** : quatre emplacements (glisser à droite court, à droite long, à gauche court, à gauche long). Chacun prend une action : Terminer, Rouvrir, Planifier, Aujourd'hui, Demain, Reporter d'une semaine, Déplacer vers un projet, Priorité, Supprimer, ou Aucune. Le fond change de couleur et le téléphone vibre à chaque seuil. « Rétablir les gestes par défaut » remet tout. Une suppression ou un déplacement affiche « Annuler » pendant quelques secondes.

### La fiche d'une tâche

Une feuille plein écran. En haut : retour, titre modifiable sur place, minuteur de concentration, menu d'actions (dont **Découper en étapes** et, si un agent est branché, **Discuter avec l'IA**). Puis des pastilles (date, priorité, projet, statut, tags), chacune affichée seulement si elle a une valeur ; les sous-tâches ; Début → échéance, Répétition, Estimation, Priorité, Statut, Étiquettes, Projet, chacun ouvrant sa feuille ; la description rendue (touchez le crayon pour éditer le texte brut) ; une seule barre **Joindre · Commenter · Historique**.

**Il n'y a pas de bouton « Enregistrer »** : chaque sélecteur écrit sa valeur dès qu'on le choisit ; le titre et la note s'écrivent après 700 ms de pause et à la fermeture. Terminer se fait par la case à côté du titre.

Autres éléments : liens « **Bloque** » et « **Bloquée par** » (ajout, retrait, mention « Bloquée »), **Prochaine tâche** d'un projet, **Historique** (chaque changement avec date, heure et origine : l'app, un appareil, l'IA, une suggestion acceptée), commentaires et personne assignée (synchronisés hors ligne), pièces jointes (en ligne). Un lien dans le nom d'une tâche affiche le titre de la page, son icône et son image ; « Ouvrir le lien » est dans la fiche. Pour une tâche récurrente, modifier ou supprimer demande « Seulement celle-ci », « Celle-ci et les suivantes » ou « Toutes » ; « Retirer aussi de ma journée » est proposé.

## Capturer

### Ajout rapide

Le bouton « + » ouvre une feuille avec **un seul champ**. Tapez comme vous parlez : l'analyse transforme les mots en pastilles sous le champ ; toucher une pastille la retire et rend le mot au titre.

| Vous tapez | Résultat |
|---|---|
| aujourd'hui, demain, après-demain, un jour de la semaine | la date (le prochain jour nommé ; « lundi prochain » = ce jour de la semaine suivante) |
| dans 3 jours, dans 2 semaines, dans 1 mois | la date relative |
| ce soir | aujourd'hui à 19:00 |
| ce week-end, semaine prochaine | samedi, lundi |
| à 14h, 14h30, 14:30, midi | l'heure |
| `!1` à `!3` | la priorité |
| `+projet` ou `^projet` | le projet |
| `#nom` | une étiquette, sinon un projet |
| `@étiquette` | une étiquette |

Un mot qui ne désigne rien d'existant reste dans le titre. « Plus d'options » ouvre priorité, projet, tags. Après chaque ajout, **le clavier reste levé** pour saisir en série ; « Annuler la dernière » rattrape une erreur ; « Terminé » ferme. Une **adresse web seule** propose Inbox · Tâche · Liens · Note (« Dans les liens » d'emblée si elle est déjà gardée).

### Inbox

L'onglet **Inbox** : un champ « Capturer une idée... », les idées en liste avec les actions « Aujourd'hui » et « ... » (Planifier, Projet, Note, Modifier). Le « + » y ouvre une capture avec une cible **Inbox / Tâche / Note**, comme sur le web. Voir [Boite-de-reception-et-capture](Boite-de-reception-et-capture).

### Depuis une autre application

- **Partager** un lien ou un texte vers Cadence : la feuille « Ajouter à Cadence » offre Inbox, Tâche, Projet... ou Note, et une ligne **Échéance** (Aujourd'hui, Demain, Ce week-end, Choisir ; toucher la date choisie la retire). Avec une échéance, la tâche ne passe plus par « Tâches à classer ». Si l'adresse est déjà dans une tâche ou un projet, la feuille dit « Déjà dans « ... » » avec Ouvrir ou « Ajouter quand même ».
- **Sélectionner du texte** puis l'action « Cadence » du menu de sélection.
- La **tuile « Capturer »** des réglages rapides du téléphone.
- L'application **Proches** (application compagnon, Android seulement) peut remettre une proposition acceptée comme tâche : seule l'application dont la signature est celle attendue est acceptée, la tâche est créée une seule fois même si la remise est rejouée, et elle se synchronise comme une tâche tapée.

## Widgets

Appui long sur l'écran d'accueil › Widgets › Cadence. Ils se configurent par un appui long puis « Configurer », ou dans Réglages › Personnalisation › **Widgets**.

| Widget | Contenu |
|---|---|
| **Aujourd'hui** (celui à privilégier) | En-tête (titre de la portée, compteur, « + » et « ... »), tâches, événements d'agenda et habitudes du jour |
| **Cadence – Barre de capture** (4×1) | « Nouvelle tâche... », « Idée », « Dicter » |
| **Cadence – Ajouter** (1×1) | Un bouton d'ajout rapide |
| **Cadence – Tâches 2×2** | Les tâches du jour en petit format, à cocher depuis l'accueil |
| **Cadence – Liste (ancien)** | L'ancienne liste, gardée pour les installations existantes |
| Widget d'habitudes | Les habitudes à saisir en un geste |

Le widget **Aujourd'hui** se règle finement : **fond** Verre (par défaut, opacité réglable), Automatique, Clair, Sombre ou Aucun ; couleur des cases (Priorité par défaut, Blanc, Projet, Indigo, Corail, Menthe, Ambre ou libre) ; modules Tâches et Habitudes, leur ordre ; **portée** (En retard + aujourd'hui, Aujourd'hui, Demain, 3 ou 7 prochains jours, Sans date, Inbox, un projet), filtres (projets, tags, priorité haute, masquer les récurrentes), tri, regroupement par jour (Hier, Aujourd'hui, Demain, dates), cocher depuis le widget, taille du texte, rayon des coins. Sous 180 dp sur un axe (2×1, 2×2), il passe en mode compact : le compteur et la prochaine chose à faire, tapée pour ouvrir.

Cas particuliers : une coche de widget rend la main aussitôt ; décocher annule vraiment ; un toucher sur une tâche l'ouvre même si l'application est déjà ouverte ; le widget ne « saute » plus après une coche ou un ajout.

## Agenda

Un sélecteur **Jour · 3 jours · Mois · Liste**. Glissez horizontalement pour changer de période (jour ±1, 3 jours ±3, mois ±1, liste ±30 jours).

- **Jour** : bande de la semaine, tiroir « **À planifier** » (glisser une tâche sur la grille lui donne sa date et son heure), ligne « journée entière », grille horaire, trait « maintenant ». L'Agenda suit les heures visibles réglées sur le web et grise ce qui sort des heures de travail. Une tâche planifiée se redimensionne par sa poignée.
- **Événements de l'appareil** (calendriers du téléphone, comptes Google compris) : un toucher ouvre une feuille de détail (heure, agenda, lieu, description). **Masquer ici** retire l'occurrence de Cadence seulement (Agenda, Tâches, widget), jamais chez le fournisseur ; « Annuler » est proposé, et Réglages › Organisation › **Agendas** les liste pour les rétablir. Cocher un événement le marque fait dans Cadence seulement. **Cocher une fois passé** (par agenda) affiche comme faits les événements terminés. Ces coches et masquages restent locaux : ils ne se synchronisent pas.
- **Affichage** : interrupteurs (tâches avec heure, habitudes, terminées, week-ends, n° de semaine) et la liste des agendas, la même qu'en Réglages › Agendas (par compte : utiliser, Agenda, Tâches, Notifications, Cocher une fois passé) ; le pied de la feuille mène à « Tous les réglages des agendas ».
- Les **agendas ICS abonnés** sur le serveur s'affichent dans l'Agenda (en ligne). **Google Agenda et Tâches** se connectent dans Réglages › Agendas (« Connecter Google » ouvre la connexion dans le navigateur et revient dans l'app). Voir [Agenda-et-calendrier](Agenda-et-calendrier).

Dans la liste Tâches, un événement d'agenda est une ligne comme une tâche : le balayage « Terminer » le coche, « Supprimer » le masque.

## Habitudes

Deux segments : **Aujourd'hui** et **Toutes** (abstinences, habitudes, activités libres, groupes). Saisie rapide par un « +1 » ou un minuteur ; la fiche d'une habitude donne son objectif, sa série et sa période ; les **questions apprises** vous demandent le lendemain, à l'heure choisie, ce qui manque un jour habituel (Non, Oui, Oui + quantité). Réglages dédiés : « Moments de la journée » (groupes), « Mode voyage », **Health Connect**. Tout est détaillé dans [Habitudes](Habitudes).

## Bilan

L'onglet **Bilan** : « Semaine du ... », trois indicateurs (terminées cette semaine avec la semaine dernière en comparaison, échues, régularité des habitudes sur 30 jours), les tâches de la semaine par projet, une carte Objectifs, la **Revue** (À décider, Repoussées, Projets, Plus tard, Anciennes, Semaine, avec capacité hebdomadaire, « Aide-moi à choisir », revue rapide d'environ 5 minutes, jamais plus de 10 éléments), et les panneaux **Week-end** et **Carrière** de l'IA. La revue est calculée par le serveur : hors ligne, la dernière lecture reste visible. Voir [Revue-bilan-et-focus](Revue-bilan-et-focus), [Objectifs](Objectifs) et [IA-et-propositions](IA-et-propositions).

## L'IA sur Android

Aucun bouton d'IA n'apparaît quand aucun agent n'écoute le serveur. Sinon :

- **Planifier ma semaine** et **Préparer ma revue** (une feuille en bas, regroupée par jour, « Appliquer (N) »), **Carrière**, **Week-end**, **Décider**, **Trier mes mails** : tous décrits dans [IA-et-propositions](IA-et-propositions) et [Tri-des-mails](Tri-des-mails). Ils demandent une connexion : hors ligne, les actions disent « Hors ligne » et ne gardent rien.
- **Le rituel du matin** : le matin, quand l'IA a replacé vos retards, la notification « N retards replacés, à valider » ouvre trois étapes de grandes cartes. (0) « Mails » : le deck des mails à trier, s'il y en a. (1) « Hier et retards » : une carte par tâche en retard, avec l'avis de l'IA mis en valeur ; glisser à droite suit le conseil, à gauche = Demain, vers le haut = Plus tard ; ou gros boutons (Aujourd'hui, Demain, Plus..., Faite, Abandonner), avec « Annuler » pour revenir d'une carte. (2) « Ta journée » : « Ce qui compte » (jusqu'à 3 tâches à étoile), les événements, les tâches du jour, la charge (« 3 h prévues · 4 h libres »), « Pas aujourd'hui » pour renvoyer à demain. « C'est parti » applique tout d'un appel et ouvre Aujourd'hui ; « Plus tard » ferme sans appliquer. Rien n'est écrit avant la dernière étape.
- **Classement automatique** : notifications avec « Tout accepter » / « Ignorer » / « Ouvrir ».
- **Discuter avec l'IA** et **Découper en étapes** dans la fiche de tâche.
- **Réglages** : Organisation › Classement automatique et À trier.

## Notifications et rappels

Réglages › Organisation › **Notifications** : « Une seule voix : le téléphone sonne, calmement. »

- **Tâches à heure fixe** : une tâche qui a une heure sonne à cette heure, sans rappel à poser ; un rappel choisi passe avant. Android ne laisse sonner à la minute près que si vous accordez « Alarmes et rappels » (« Heure exacte ») ; sinon à environ une minute près.
- **Boutons du rappel** : Terminer, Plus tard · 10 min, À la fin, Demain.
- **Événements d'agenda** : un rappel avant le début (à l'heure ou N minutes avant, réglable par agenda), « Dans N min · titre », boutons Fait, À la fin, 10 min. Option « Résumé des journées entières à 8 h ». Un même événement présent sur plusieurs agendas ne sonne qu'une fois.
- **Habitudes** : rappel à l'heure de la fiche, tant que l'habitude reste à faire.
- **Heures calmes** : réglées dans votre profil, sur le web ; tout ce qui y tombe sonne à leur fin.
- **Agents** : « Notifications instantanées des agents » garde une notification permanente (masquable) pour recevoir tout de suite les messages de l'agent, dans « Agents · à décider » ou « Agents · infos » ; « Ne pas optimiser la batterie » évite que le téléphone coupe la connexion en veille. Une bannière d'une ligne en haut des écrans montre le dernier message non lu (« Ouvrir », « Marquer comme lu », « +N »). « Répondre » sur une notification d'agent envoie une réponse libre, gardée sur le téléphone jusqu'à son envoi. Une notification lue ailleurs disparaît.
- La liste des **Notifications** (cloche) ne montre que ce qui attend encore de vous : propositions, mails à trier, décisions, messages des agents.
- Les rappels sont reprogrammés après un redémarrage, une mise à jour ou une synchronisation.

Voir [Notifications-et-rappels](Notifications-et-rappels).

## Carte des Réglages

| Section | Pages |
|---|---|
| **Personnalisation** | Apparence, Widgets |
| **Organisation** | Agendas, Notifications, Planification (heures de travail, jours travaillés, fin de journée, plages protégées, exceptions, « Planifier change l'échéance »), Classement automatique, À trier, Gestes, Moments de la journée, Mode voyage, Health Connect |
| **Données** | Sauvegarde (Exporter / Importer), Compte Cadence, Synchronisation, Plugins (administrateur seulement) |

La page **Plugins** de l'administrateur montre l'état de chaque plugin, ses permissions, un bouton d'approbation, « Mettre à jour », « Recharger », « Supprimer » (voir [Integrations-MCP-et-plugins](Integrations-MCP-et-plugins)).

## Ce qui n'est pas sur Android

Les vues pensées pour un grand écran restent au web : l'aperçu de la semaine de l'IA posé sur le tableau du Plan, le calendrier fusionné du Plan, la feuille de route trimestrielle, la chronologie (Gantt) d'un projet, les panneaux Notes/Objectifs/Habitudes de la barre latérale. Les **données** restent les mêmes : seul l'écran diffère. Le web de son côté n'a pas les calendriers de l'appareil ni les widgets. Pas de réglages de clés d'API ni de connecteur MCP sur le téléphone (le serveur s'en occupe).

## Pour aller plus loin

- [Notes de conception Android](https://github.com/PreciselyWrong/cadence/blob/main/android/docs/REDESIGN.md) (navigation, widgets, ligne de tâche)
- [Notes UX Android vers web](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/ANDROID-UX-NOTES.md)
- [Synchronisation hors ligne](https://github.com/PreciselyWrong/cadence/blob/main/docs/30-offline-sync.md), [Notifications](https://github.com/PreciselyWrong/cadence/blob/main/docs/36-notifications.md), [Rituel du matin](https://github.com/PreciselyWrong/cadence/blob/main/docs/50-morning-ritual.md), [Remise depuis Proches](https://github.com/PreciselyWrong/cadence/blob/main/docs/42-proches-handoff.md)
