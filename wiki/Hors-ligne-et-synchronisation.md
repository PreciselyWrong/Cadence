# Hors ligne et synchronisation

Cadence reste utilisable quand le serveur est injoignable (métro, avion, panne du réseau domestique) : vous continuez à lire, ajouter, cocher, replanifier ; les modifications partent dès que le serveur revient, dans l'ordre, sans doublon, et les rares désaccords sont rendus visibles au lieu d'être écrasés en silence.

## Trois façons de rester hors ligne

| Client | Comment | Ce qui est gardé |
|---|---|---|
| **Android** | Une copie locale complète (base Room) synchronisée par un protocole dédié (`/api/v1/sync`) | Tout, y compris les habitudes ; l'app est « hors ligne d'abord » |
| **Web (navigateur)** et **client Linux** | Un service worker garde l'application et les dernières réponses du serveur, et met vos écritures en file d'attente | Les écrans déjà ouverts une fois en ligne, plus vos écritures en attente |
| **Add-on Firefox** | Rien : il n'enregistre qu'en ligne | Rien (message « Serveur injoignable. Rien n'a été enregistré. ») |

Ce qui reste **en ligne seulement**, partout : l'IA (classement, propositions, aperçus), la connexion, les notifications push, CalDAV et les flux d'agenda, la synchronisation Google, Telegram, l'appairage MCP, l'administration, les aperçus de liens, les envois de fichiers (pièces jointes, bannières, avatars). Ces fonctions répondent « indisponible » hors ligne et l'écran affiche son erreur habituelle.

## Web et client Linux

### Ce qui marche sans serveur

- **L'application s'ouvre** : la coque (environ 5 Mo) est mise en cache à l'installation du service worker.
- **La lecture** vient des dernières réponses mises en cache, avec **vos écritures en attente posées par-dessus** : une tâche créée hors ligne apparaît tout de suite dans la liste et dans la page de son projet.
- **Les écritures** (créer, renommer, cocher, replanifier, supprimer) sont gardées dans une file (IndexedDB) et le serveur répond localement « c'est enregistré ». Une tâche créée hors ligne reçoit tout de suite son identifiant.
- **Les écrans jamais ouverts en ligne** sont vides hors ligne : un écran se met en cache la première fois qu'on l'ouvre. Ouvrez une fois Aujourd'hui, Planifier, Projets, Notes, Habitudes avant de partir.

### La pastille en bas de l'écran

Une pastille d'angle n'apparaît que lorsqu'il y a quelque chose à savoir :

| Pastille | Signification |
|---|---|
| **Hors ligne** | Le serveur est injoignable ; rien n'est en attente |
| **Hors ligne · N en attente** | N modifications attendent d'être envoyées |
| **Envoi des modifications (N)** | Le serveur est revenu, la file part |
| **Non enregistrées : N** | Le serveur a refusé N modifications (la liste donne la raison ; « OK » l'efface, « Réessayer » les renvoie) |
| **Conflits : N** | Après un envoi, N champs ont été modifiés ailleurs entre-temps (voir « Conflits ») ; « Voir les conflits » ouvre Profil › Synchronisation |

Le texte d'aide dit : « Vos modifications restent sur cet appareil et partent dès que le serveur revient. »

### Quand est-on « hors ligne » ?

Une erreur réseau, une absence de réponse en 4 secondes (15 secondes pour une écriture), ou un `502`/`504` d'un proxy comptent comme injoignable. Après un échec, l'application répond localement tout de suite et vérifie toutes les 15 secondes si le serveur est revenu, ainsi qu'à l'événement « en ligne » du navigateur et quand l'onglet reprend le focus.

### Au retour du réseau

1. La file est rejouée **dans l'ordre**, en s'arrêtant au premier échec réseau. Tant que des écritures attendent, une nouvelle écriture passe derrière, même si le serveur est revenu : l'ordre est préservé.
2. Chaque écriture rejouée garde **son heure de modification d'origine**, son identifiant choisi à la création et une clé anti-doublon : si la réponse s'est perdue, renvoyer ne crée pas deux tâches.
3. Les identifiants temporaires sont remplacés, les écrans se rafraîchissent.
4. Une écriture refusée (erreur 4xx, ou 500 trois fois de suite) est **mise de côté** et signalée (« Non enregistrées »).

| Situation | Ce qui se passe |
|---|---|
| Session expirée pendant la coupure | Au rejeu, le serveur répond 401 : la file est **gardée**, vous revoyez la page de connexion, et le rejeu reprend dès que le même utilisateur se reconnecte. Se déconnecter vide les réponses en cache, jamais les écritures en attente |
| Un autre utilisateur se connecte sur la même machine | Les écritures sont étiquetées par utilisateur : un rejeu n'envoie jamais celles d'un autre |
| Plan d'un jour modifié ailleurs entre-temps | Le plan porte une étiquette de version : le rejeu est refusé (`412`) et listé comme « non enregistré » |
| Une écriture lente (pas d'erreur, juste un délai) | N'est pas prise pour une panne : elle est réessayée au rejeu suivant, puis mise de côté après trois essais, et les lectures continuent d'atteindre le serveur |
| Une fonction « en ligne seulement » restée dans la file par une ancienne version | Elle est abandonnée au rejeu et jamais envoyée |

### Limites à connaître

- Les compteurs, l'ordre calculé et la prochaine occurrence d'une tâche récurrente sont ceux de la dernière lecture en ligne, jusqu'au retour du réseau.
- Un écran qui garde ses lignes dans son propre état peut afficher la valeur hors ligne même si un conflit a conservé l'autre valeur : rouvrez l'écran.
- Les habitudes cochées hors ligne partent au retour du réseau, mais la progression affichée hors ligne est la dernière en cache.
- Une liste de tags modifiée hors ligne **l'emporte** sur une modification de tags plus récente faite ailleurs (la table de liaison n'a pas d'horloge par ligne).
- La recherche côté serveur ne répond que sur ce qui a été mis en cache.

### Client Linux

La fenêtre principale est une vue web sur l'adresse de votre serveur : elle enregistre le même service worker, stocké dans le dossier de données de l'application. Si le serveur est injoignable à l'ouverture, la coque en cache s'affiche. L'ajout rapide global (`Ctrl+Alt+Space`) a en plus sa **propre file de captures** dans le processus de la barre système. Voir [Client-Linux-et-Firefox](Client-Linux-et-Firefox).

## Android

### Première connexion et synchronisation

1. Réglages › Données › **Compte Cadence** : « Scanner le code QR » (créé dans Profil › Clés API sur le web) ou saisir l'adresse du serveur et la clé.
2. Le téléphone prend une **copie complète** (instantané), page par page, puis ne demande plus que les changements depuis son curseur.
3. Chaque écriture locale part dès que le réseau est là, et une passe périodique tourne environ toutes les 15 minutes. Un passage manqué (serveur injoignable) est réessayé en recul exponentiel (30 secondes, 1 minute, 2 minutes...) tant que le réseau est là, sans retenir les synchronisations suivantes.
4. « Synchroniser maintenant » force un passage.

**Ce qui est synchronisé** : tâches, projets, zones, étiquettes, notes, idées de la boîte de réception, objectifs (et résultats clés), liens, commentaires et assignation des tâches, sections de projet (Kanban), les 15 sortes de données d'**habitudes** (habitudes, objectifs, plannings, saisies, pauses, groupes, rappels, valeurs rapides, chronos, règles Health Connect, abstinence, alcool, questions apprises...). Les habitudes d'un ancien compte ne sont jamais envoyées à un autre compte : l'application demande de les garder sur le téléphone seulement, ou de les supprimer.

**Ce qui reste local à ce téléphone** : cases cochées et événements masqués de l'agenda de l'appareil, report de rappels (« Plus tard · 10 min »), configuration des widgets, minuteur de concentration, réglages d'affichage.

**Ce qui demande une connexion** : la Revue (calculée par le serveur ; la dernière lecture reste visible, « Hors ligne · lecture du... »), les propositions de l'IA, les aperçus de liens, les pièces jointes, la connexion à Google, « Découper en étapes », les écrans Réglages › Classement automatique, À trier et Plugins.

Une tâche pas encore envoyée est signalée « Modification non synchronisée ». Le bandeau d'état dit « Hors ligne : envoyé dès le retour du réseau » quand c'est le cas.

### Comment une modification est envoyée

Chaque champ porte une **horloge hybride** ; chaque écriture a un identifiant unique et le serveur ne l'applique qu'une fois (rejouer la même écriture renvoie le même résultat sans rien refaire). Le téléphone choisit lui-même l'identifiant d'une nouvelle tâche : une tâche créée hors ligne puis éditée plusieurs fois reste la même tâche.

- Avant chaque passage, le téléphone lit ce que le serveur sait faire. Un type de donnée inconnu du serveur (serveur plus ancien) **reste en attente** ; l'écran Synchronisation indique « Ce serveur ne connaît pas encore : ... ».
- Un lot refusé est réessayé en deux moitiés (24 requêtes au plus par passage) pour isoler l'écriture fautive : elle est marquée refusée (4xx) ou gardée avec les suivantes de sa ligne (500) ; une surcharge (429, 502, 503, 504) arrête l'envoi.
- Une tâche récurrente complétée sur deux appareils hors ligne pour le même jour n'avance **qu'une fois** : l'occurrence est réclamée côté serveur, la seconde est reconnue comme déjà faite.

### Cas limites

| Situation | Résultat |
|---|---|
| Vous modifiez un titre hors ligne, quelqu'un le modifie ailleurs | Merge **champ par champ** : si les deux ont touché des champs différents, tout est gardé ; sur le même champ, la valeur la plus récente gagne et l'autre est gardée dans les conflits |
| Vous éditez une tâche supprimée ailleurs | **Supprimer l'emporte** : la modification est refusée, la tâche ne revient pas |
| La tâche pointe vers un projet supprimé entre-temps | La tâche **garde son contenu** : la référence morte est retirée et elle atterrit dans « Tâches à classer » |
| Vous poussez une référence vers la ressource d'un autre compte | Refusé |
| Horloge du téléphone avancée de plus de 24 h | L'écriture est rejetée |
| Téléphone resté hors ligne très longtemps | Voir « Compaction » ci-dessous : nouvelle copie complète |

## Conflits et réconciliation

Un **conflit** naît quand un appareil envoie une valeur *plus ancienne* que celle que le serveur détient : le serveur garde la sienne et **conserve la valeur perdante** pour que vous tranchiez.

- **Web** : Profil › **Synchronisation** liste les appareils (dernière synchronisation de chacun), la dernière modification sur le serveur, les modifications faites hors ligne dans ce navigateur qui attendent, et les **conflits ouverts** : pour chacun, l'élément (« Tâche », « Projet »...), le champ, la valeur **gardée** et la valeur **écartée**, avec deux boutons.
  - « **Garder cette valeur** » (la valeur écartée) la repose comme une édition neuve, datée de maintenant, qui passe les mêmes contrôles qu'une écriture d'appareil et gagne la fusion : tous les appareils la reçoivent.
  - « **Garder l'autre** » ne change rien (la valeur serveur reste) et efface le conflit de la liste.
  - Les habitudes ne proposent que « Compris ».
  - Seule la dernière perte de chaque champ est listée ; un conflit dont l'élément n'existe plus, ou qui contient déjà la valeur perdue, n'apparaît pas.
- **Android** : Réglages › Données › **Synchronisation** montre les appareils, puis les conflits du serveur suivis de ceux que seul le téléphone connaît (hors ligne ou pas encore lus), une ligne par champ : « Ce téléphone : ... » contre « Serveur : ... », « Garder ce téléphone » / « Garder le serveur », « Compris ». Régler une ligne déjà connue du serveur règle aussi la copie du téléphone. La liste « Refusées par le serveur » garde les écritures refusées, avec « Effacer la liste ».
- **Une modification web** est datée de l'horloge du serveur, toujours en avance sur les horloges qu'il a acceptées : une édition web gagne donc contre une plus ancienne faite hors ligne. Une écriture web **rejouée** après coup garde en revanche son heure d'origine, et peut donc elle-même perdre : elle est alors comptée dans « Conflits : N ».

Exemple : lundi à 9 h, dans le métro et sans réseau, vous renommez « Appeler le garage » en « Appeler le garage Dupont » ; à 9 h 05, sur le web, quelqu'un renomme la même tâche en « Rappeler Dupont ». Au retour du réseau, le serveur garde « Rappeler Dupont » et le conflit propose « Garder cette valeur : Appeler le garage Dupont ».

## Compaction du journal

Le serveur tient un journal de changements. Chaque nuit, il le compacte : une entrée de plus de **30 jours** qui a une suite pour la même ligne est retirée, et les marques de suppression sont gardées 30 jours puis retirées (réglable côté serveur, voir [Auto-hebergement](Auto-hebergement)).

- Un appareil qui demande des changements depuis un point déjà compacté reçoit « reset requis » : il **reprend une copie complète** automatiquement. C'est le cas typique d'un téléphone resté éteint plus d'un mois.
- Une fois la marque de suppression disparue, « supprimer l'emporte » ne tient plus pour cette ligne : un appareil resté hors ligne plus longtemps que la durée de conservation, qui modifierait une ligne supprimée entre-temps, la recréerait.

## Rappels et hors ligne

Les rappels de tâches sont reprogrammés après un redémarrage du téléphone, une mise à jour de l'app ou une synchronisation ; les heures calmes de votre compte repoussent les rappels de tâches et d'habitudes à leur fin. Un « 410 reset requis » reçu pendant la synchronisation déclenche la nouvelle copie complète. Voir [Notifications-et-rappels](Notifications-et-rappels).

## Pour aller plus loin

- [Offline Sync](https://github.com/PreciselyWrong/cadence/blob/main/docs/30-offline-sync.md) : protocole, entités, règles de fusion
- [Web UI offline](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/WEB-OFFLINE.md) : service worker, file d'écritures, limites
- Pages liées : [Android](Android), [Client-Linux-et-Firefox](Client-Linux-et-Firefox), [Habitudes](Habitudes)
