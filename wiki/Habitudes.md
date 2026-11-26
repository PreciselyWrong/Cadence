# Habitudes

Une habitude n'est pas une tâche : elle collecte des **entrées** (« lu 20 pages », « un verre »), jamais des « terminées », et se juge sur des périodes (jour, semaine, mois) avec une série, pas sur une échéance. Les habitudes de Cadence sont les mêmes sur le web, sur Android et sur le serveur : vous notez sur le téléphone, vous voyez les mêmes cartes et statistiques sur le web.

![Habitudes](images/web/habits.png)

## Habitudes classiques et habitudes Cadence

Avant, une habitude était une tâche marquée « habitude ». Ce n'est plus le cas :

- Les habitudes d'aujourd'hui sont les **habitudes Cadence** : le modèle de l'app Android (objectif et planning versionnés, limites, pauses, minuteurs, groupes), stocké sur le serveur pour que tous les appareils lisent et écrivent les mêmes données.
- **Une habitude n'apparaît jamais dans une liste de tâches.** Elle a sa page, sa section dans Aujourd'hui et ses repères dans l'agenda.
- **L'import des anciennes habitudes** : au démarrage du serveur, chaque ancienne habitude-tâche qui n'a pas encore d'équivalent devient une habitude Cadence (le nom, la description, la couleur, l'archivage, la date de départ, l'objectif, le planning, le moment de la journée, un rappel et chaque pointage passent). Les anciennes lignes ne sont **ni supprimées ni modifiées** ; elles restent hors des listes de tâches, d'Aujourd'hui, du calendrier et du plan.
- Une habitude importée garde le même résultat dans l'esprit, mais sa **série et sa force sont recalculées** par les règles Cadence et peuvent différer des anciens chiffres. Un pointage « quantité » sans valeur ne comptait pour rien avant et n'est pas importé.
- Les habitudes de départ de l'accueil (« oui » tous les jours, certains jours, ou une fois par semaine) créent des habitudes Cadence.

## La page Habitudes

Les habitudes sont **regroupées par moment de la journée** (matin, après-midi, soir, n'importe quand ; les groupes vides sont masqués). Chaque carte a le même aspect qu'Android : dégradé teinté, une **facette hexagonale** remplie selon la progression de la période, la ligne d'état, la série, et l'action rapide.

**La ligne d'état** dit où vous en êtes : « 2 / 30 min », « 1 sur 2 verres max », « 12 jours sans écart », « En pause », « Non prévue aujourd'hui », « Fait », « Limite atteinte », « Limite dépassée ».

**La saisie rapide**
- **Oui / non** : un seul toucher.
- **Quantité ou durée** : un toucher ajoute la première quantité rapide ; la flèche propose les autres quantités rapides et une **autre quantité** libre, avec une note facultative.
- Après chaque saisie, un message **Annuler** (6 secondes) supprime l'entrée.

**Onglets** : **Habitudes** et **Archivées** (avec **Restaurer**). Une ligne « N sur M faits pour l'instant » résume la journée. Un bouton **Pause ou voyage** ouvre le formulaire de pause.

**Le menu ⋯ d'une carte** : **Monter**, **Descendre** (au sein du groupe, qui est renuméroté), **Dupliquer** (copie l'objectif, le planning, les quantités rapides, les rappels et le groupe ; la copie s'appelle « `<nom>` (copie) », **démarre aujourd'hui sans historique** et se place en dernière position du groupe).

## Les types d'habitudes

| Type | Sens | Exemple |
|---|---|---|
| **Objectif** | Atteindre une cible à chaque période | Lire 20 pages par jour |
| **Limite** | Rester **sous** un maximum : rester en dessous est une réussite ; rien n'est acquis avant la fin de la période | Au plus 2 cafés par jour |
| **Activité libre** | Noter une activité sans cible, sans série ni réussite ni échec | Marche : noter les km |
| **Abstinence** | Compter les jours **sans** ; chaque écart noté recommence le compte | Sans tabac |

**Mesure** : oui/non (« Fait ou non »), **Nombre**, **Quantité** (avec une unité : minutes, pages, verres, kilomètres, etc., ou une unité personnalisée avec son nom et son symbole) ou **Durée**.

**Objectif** : un **idéal**, éventuellement un **minimum qui compte** (le seuil qui valide la période et la série ; sans minimum, les deux se confondent) et un nombre de **séances par période**. La **période** est Par jour, Par semaine ou Par mois.

**Planning** : Tous les jours, **Jours choisis**, **N'importe quel jour de la période** (rythme souple, « 3 fois par semaine »), ou **Tous les N jours** (au moins 2). Un premier jour de semaine se règle aussi.

## La page d'une habitude

Cliquer une carte ouvre `/habit/<identifiant>` :
- **Statistiques** : série en cours, meilleure série, **réussite sur 30 jours**, jours actifs, total des entrées depuis le début.
- **Calendrier** des 365 derniers jours : chaque jour a un symbole **et** une couleur (objectif atteint, minimum atteint, manqué, en pause, activité, sans écart).
- **Historique** des entrées : ajouter, modifier (date, quantité, note), supprimer.
- **Objectif et planning** : la version en vigueur et les versions passées.
- **Pauses et voyages** : voir plus bas.
- **Passer aujourd'hui** (jour de repos, malade, en voyage : la série est conservée) ; **Annuler le saut** tant qu'il tient.
- Modifier, **Archiver** (garde l'historique ; préférez-le à la suppression), **Supprimer** (supprime l'habitude et toutes ses entrées, **sur tous les appareils**).

### Tendances (« Régularité »)

La section **Tendances** (appelée **Régularité** sur Android) montre, pour une habitude :
- Une **carte de chaleur des 365 derniers jours** (aujourd'hui à droite ; les semaines plus anciennes en faisant défiler).
- Le **taux de réussite par jour de la semaine** : en quel jour vous réussissez le plus, en quel jour le moins. C'est ici que se lit le **meilleur jour**.
- Le **taux par mois**, sur 12 mois.
- Un résumé « Sur 12 mois : N % (X jours sur Y) ».

Règles de calcul : un jour compte comme *réussi* s'il est « idéal », « minimum » ou « activité » ; il compte comme *évalué* s'il est en plus « manqué » ou « aucune activité ». **Aujourd'hui ne compte qu'une fois fait.** Un jour non prévu ou en pause n'est jamais évalué. Tant qu'il n'y a pas assez de jours, l'écran dit « Pas encore assez de jours » plutôt que d'afficher un pourcentage trompeur.

### Les statistiques du téléphone (Android)

Android pousse l'analyse plus loin, sans rien inventer :
- **Bilan** : le nombre de tâches terminées cette semaine, les tâches échues, et la **régularité des habitudes** (moyenne sur 30 jours).
- **Ce que disent vos saisies** : **Meilleur jour** (« `<jour>` en moyenne, contre `<moyenne>` tous jours confondus »), **Meilleur créneau** (matin, midi, après-midi, soir, nuit), et **Ce mois, comparé au précédent** (quantité, régularité, jours au minimum, jours à l'idéal, sur les jours écoulés, pauses exclues). Les messages sont prudents : « Moins de 12 saisies pour dégager un jour dominant », « Aucun jour de la semaine ne se détache nettement », « Moins de deux mois d'historique pour comparer ».
- **Fiabilité** : « Assez de données pour s'y fier », « Encore peu de données » ou « Trop tôt pour juger », avec le nombre de périodes évaluées.
- **Comparaison à la période précédente** (« N points de mieux », « Taux identique », « Changement de rythme : comparaison suspendue ») uniquement si le rythme est homogène et que les échantillons sont suffisants.
- Une activité libre a ses propres chiffres sur 30 jours (saisies, jours actifs, quantité notée, moyenne par jour d'activité), même pendant une pause.

## Changer un objectif sans réécrire le passé

L'objectif et le planning d'une habitude sont des **versions**, chacune valable à partir d'une date. Quand vous modifiez l'objectif ou le planning d'une habitude existante, une question demande comment l'appliquer :

| Choix | Effet |
|---|---|
| **À partir d'une date (nouvelle version)** (par défaut : aujourd'hui) | Ajoute une version : les jours précédents **gardent l'objectif de l'époque** |
| **Corriger la version en vigueur** | Réécrit la version actuelle, jours passés compris : pour réparer une erreur |

C'est pourquoi une série ne saute pas quand vous passez de 10 à 20 pages : le passé reste jugé avec le 10.

## Pauses, voyages et sauts

- **Pause ou voyage** : choisissez une ou plusieurs habitudes, le premier jour, le dernier jour (inclus, facultatif) et une raison : **Repos**, **Maladie**, **Voyage**, **Autre raison** (avec vos mots).
- Les jours en pause **ne sont pas comptés comme manqués et ne cassent pas la série** ; aucun rappel ne sonne pendant une pause. Pour une abstinence, une pause interrompt la continuité du compte et reste exclue des statistiques.
- **Passer aujourd'hui** est une pause d'un jour, annulable le jour même ; un voyage est une plage qu'on peut écourter (« Terminer la pause »). Une pause à venir peut être annulée avant son début.

## Abstinence et alcool

- **Abstinence** : un profil choisi à la création (alcool, tabac, vapotage, cannabis, caféine, jeux d'argent, réseaux sociaux, écrans au coucher, achats impulsifs, ou autre) et une date de départ. La page montre la **série en cours**, la **meilleure série**, une bande des 90 derniers jours (jours sans écart / écarts notés), un bouton **Noter un écart aujourd'hui** (qui recommence le compte) et la possibilité de noter une **envie** avec une intensité de 1 à 5.
- **Alcool** : en plus, des **verres standards** par date (« à préciser » tant que la quantité n'est pas renseignée). Android calcule la fréquence sur 90 jours et un objectif personnel de jours sans alcool, et peut envoyer le lendemain une relance locale à l'heure choisie.
- **Aucune affirmation de santé** : le texte le dit (« Ces chiffres ne mesurent pas votre santé »). Aucun calcul n'est présenté comme un taux d'alcoolémie ni comme une aptitude à conduire.

## Dans Aujourd'hui et dans l'agenda

- **Aujourd'hui** (web) : une section **Habitudes · N** dans la liste du jour : un toucher coche une habitude oui/non ou ajoute sa première quantité rapide, avec annulation ; les habitudes faites se replient et suivent « Masquer les terminées ». Une habitude qui a un rappel ce jour-là apparaît comme un **repère fin** sur le calendrier du jour, à l'heure du rappel (un clic ouvre l'habitude). Sur Android, les habitudes sont dans **Ma journée**.
- **Calendrier** : « Afficher les habitudes » place les jours dus des habitudes sur la grille (une habitude à rythme souple ou une activité libre n'apparaît que les jours où elle a une saisie ; l'abstinence n'y figure jamais).

## Rappels

Chaque habitude peut avoir plusieurs rappels (une heure, des jours de la semaine, et le choix **Ne me rappeler que tant que la période n'est pas atteinte**, activé par défaut). Le **téléphone** est la voix principale (alarmes propres à chaque habitude). Le **serveur** lit aussi ces rappels et ajoute une notification dans l'application (« Rappel : `<habitude>` »), une fois par rappel et par jour, jamais pour une habitude en pause ou déjà atteinte (rappel conditionnel), et seulement si l'heure a été atteinte dans les 10 dernières minutes (un serveur arrêté longtemps ne sonne pas un rappel du matin le soir). Par défaut, seul le canal « dans l'app » est actif ; vous réglez les autres canaux dans **Réglages › Notifications** (type « Rappels d'habitudes »). Les heures calmes s'appliquent. Voir [Notifications et rappels](Notifications-et-rappels).

## Minuteur, questions apprises et Health Connect (Android)

- **Minuteur** : une habitude de durée peut proposer un chronomètre. Il garde les segments terminés et l'instant de reprise ; une pause fige le compteur, et un redémarrage du téléphone retrouve la valeur exacte.
- **Questions apprises** : pour une habitude à saisie régulière, l'app peut demander le lendemain « l'as-tu fait ? » le jour de la semaine où vous notez d'habitude (seuil de 50 % des 12 dernières semaines, au moins 4 semaines observées). Un « Non » n'écrit aucune saisie ; un « Oui » rétroactif ne déclenche aucun rappel et ne remplace jamais une saisie déjà faite.
- **Health Connect** : source locale facultative pour les habitudes de durée : Cadence lit les séances des 30 derniers jours selon une règle (types d'activité et application source) et les importe **une seule fois chacune**. Aucune donnée de santé n'est exportée.

## Hors ligne et appareils

Les habitudes sont **locales d'abord** sur Android : la saisie marche sans réseau et part avec la synchronisation suivante (quinze types de lignes : habitudes, versions d'objectif et de planning, entrées, pauses, groupes, rappels, quantités rapides, minuteurs, règles Health Connect, abstinence, alcool, questions apprises).
- **Chaque entrée garde sa date civile et son fuseau** : une saisie faite à 23 h 30 à Lisbonne reste « du jour » où vous l'avez vécue, quel que soit le fuseau de l'appareil qui l'affiche.
- Une saisie ajoutée pour une date passée garde cette date ; sur le web, elle est placée à midi de cette date dans le fuseau du navigateur.
- **Deux appareils** : les modifications des mêmes champs sont fusionnées champ par champ ; le **minuteur** est écrit d'un bloc pour ne jamais mélanger deux moitiés.
- **Changer de compte sur le téléphone** : les habitudes locales appartiennent au compte précédent. Connecté à un autre compte, Cadence ne les envoie **jamais** : l'app demande si vous voulez les **garder sur ce téléphone seulement** ou les **supprimer** (celles du nouveau compte arrivent alors d'une photographie complète). Reconnecter le compte d'origine reprend leur synchronisation.
- Un doublon créé par deux appareils sur une même clé naturelle (alcool, question apprise, import Health Connect) est résolu : l'appareil adopte la ligne du serveur.
- Supprimer une habitude supprime toutes ses lignes, sur tous les appareils.
- Un groupe supprimé renvoie ses habitudes vers « Journée » ; « Journée » n'a pas d'horaire et ne se supprime pas.

## Pour aller plus loin

- [Habitudes (doc)](https://github.com/PreciselyWrong/cadence/blob/main/docs/21-habits.md), [Notifications (doc)](https://github.com/PreciselyWrong/cadence/blob/main/docs/36-notifications.md), [Android](https://github.com/PreciselyWrong/cadence/blob/main/android/AGENTS.md)
- Pages du wiki : [Aujourd'hui et plan du jour](Aujourd-hui-et-plan-du-jour), [Hors-ligne et synchronisation](Hors-ligne-et-synchronisation), [Android](Android), [Revue, bilan et focus](Revue-bilan-et-focus)
