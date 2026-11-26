# Aujourd'hui et plan du jour

Aujourd'hui sert à **faire** la journée : une liste de ce qui est prévu ou dû ce jour-là, à côté d'un calendrier où l'on place les tâches entre les rendez-vous. Planifier, sa voisine, sert à **répartir** : où va chaque tâche, ce jour, cette semaine ou « un jour ». Cette page décrit les deux, ainsi que les règles du plan du jour.

![Aujourd'hui : la liste du jour et son calendrier](images/web/today.png)

## La page Aujourd'hui

### Ce qu'on y voit

De haut en bas, dans la colonne de gauche :

1. **L'en-tête** : un gros titre (« Aujourd'hui », ou « Demain », « Hier », sinon le nom du jour) avec la date à côté, les flèches de jour, le bouton « Aujourd'hui » et, à droite, les actions de la page (voir plus bas).
2. **Une ligne de résumé** : « 8 tâches · 4 h 40 » (le nombre à faire et le temps estimé). Quand la journée déborde, elle devient « 4 h 40 prévues pour 3 h 50 libres », en ambre ; le détail (« nécessaires · libres ») est dans l'infobulle. Il n'y a pas de jauge.
3. **Le champ « Ajouter une tâche »** : la tâche est ajoutée **à la journée affichée**, sans échéance. Il lit les dates, priorités et étiquettes comme la capture rapide (voir [Boîte de réception et capture](Boite-de-reception-et-capture)).
4. **« En retard · N »**, replié, seulement s'il y a des tâches échues.
5. Un bandeau d'alerte discret quand un créneau est dépassé (voir « Ordre du jour »).
6. **« À caser · N »** : les tâches de la journée sans heure.
7. **« Ma journée »** : la ligne du temps, avec l'heure actuelle, les rendez-vous et les créneaux libres.
8. **« Habitudes · N »** (voir plus bas), **« Demain · N »**, **« Suggestions · N »** et **« Terminées · N »**, repliés.

Les sections repliables démarrent **fermées** (seule « Habitudes » démarre ouverte) et se souviennent de leur état dans ce navigateur : Aujourd'hui ne montre que la journée.

### Quelles tâches sont dans « la journée »

Une même fonction du serveur répond pour le web, Android et les agents :

- les tâches **prévues** ce jour-là (une ligne de plan) ;
- plus les tâches **ouvertes dues ce jour-là** qui ne sont prévues sur aucun autre jour à partir d'aujourd'hui.

Chaque tâche n'apparaît **qu'une seule fois**. Une sous-tâche dont la date tombe ce jour-là est listée sous le nom de sa tâche parente. Une tâche récurrente terminée est montrée comme faite pour l'occurrence du jour, puis la même tâche passe à sa date suivante.

### Une ligne du jour

Une ligne montre l'heure (minutes en petit), la case ronde, le titre, puis une ligne de puces : projet, deux étiquettes, durée et heure de fin (« 30 min → 9:30 ») ou durée et échéance. La tâche **en cours** est teintée. Rien n'apparaît au simple survol ; les actions viennent au clic droit, ou au bouton « ⋯ » de la ligne sélectionnée.

- **Cliquer une ligne ou un bloc du calendrier** ouvre la fiche **sous la page** (`?task=`) ; la ligne reste sélectionnée. Un clic sur un événement d'agenda ouvre sa fiche en lecture (voir [Agenda et calendrier](Agenda-et-calendrier)).
- Le **menu de la ligne** (clic droit) propose : « Planifier au prochain créneau libre », « Retirer l'horaire », « Reporter à demain », « Reporter à la semaine prochaine », « Retirer de la journée », « Ouvrir », puis le menu commun de la tâche (voir [Tâches](Taches)).
- Le bouton **« Détails »** de l'en-tête déplie, sous chaque ligne, la description et les sous-tâches.
- **« Masquer les terminées »** (menu « ⋯ ») cache ce qui est fait, y compris les habitudes déjà faites.

## La barre du jour et les flèches

L'en-tête contient la seule navigation de date de la page : **« Jour précédent »**, **« Jour suivant »** et **« Aujourd'hui »**. La date visible est celle de l'adresse (`?date=`), partagée entre la liste et le calendrier : les deux montrent toujours le même jour.

- Le bouton « Aujourd'hui » est **toujours là**, grisé quand vous êtes déjà sur aujourd'hui. Avant, il n'apparaissait que sur un autre jour et la barre sautait à chaque changement ; elle ne bouge plus.
- Les flèches gardent leur place quelle que soit la longueur du nom du jour : le titre réserve la largeur du nom le plus long, pour que le pointeur reste sur la flèche en cliquant plusieurs fois de suite.
- Sur un autre jour, le titre dit « Hier », « Demain » ou le nom du jour. « Rien de prévu ce jour-là. » s'affiche si la journée est vide ; aujourd'hui, une journée vide suggère d'ajouter une tâche ou d'en prendre une dans les suggestions.
- Les replis « En retard », « Demain » et « Suggestions » ne concernent que **aujourd'hui** ; les autres jours n'affichent pas de retards.

## Le calendrier du jour

À droite, un calendrier montre **1, 3 ou 7 jours** à partir du jour ouvert (sélecteur « Jours affichés »). Il se redimensionne par la poignée de séparation (largeur mémorisée) et se masque par « Masquer le calendrier » ; le bouton « Calendrier » le ramène.

- **Où il se place** : à côté de la liste dans une fenêtre d'au moins environ 1180 px et tant que les deux colonnes gardent leur largeur minimale ; sinon c'est un tiroir qui recouvre la liste. Sur téléphone, un bouton « Calendrier » et un bouton « Liste » permettent de passer de l'un à l'autre. Pour 7 jours dans un calendrier trop étroit, un message dit « Trop étroit pour 7 jours : élargissez le calendrier ou affichez moins de jours ».
- **Le dessin** : un bloc plat à la couleur du projet pour une tâche avec créneau ; une couleur de calendrier pour un événement ; le temps protégé en hachures ; une tâche à échéance horaire sans créneau est dessinée **à son heure, comme un rendez-vous** (c'est souvent un vrai rendez-vous saisi par « demain 15h ») ; une ligne rouge pour l'heure actuelle, sur aujourd'hui seulement.
- **Les heures visibles** suivent l'option « Heures visibles » du Calendrier (voir [Agenda et calendrier](Agenda-et-calendrier)) : tout ce qui est planifié en dehors s'affiche dans des barres « N avant » et « N après » ; « Afficher toutes les heures » les déplie pour la session, « Masquer les heures tôt et tard » rétablit la fenêtre enregistrée. L'heure de travail définie dans le profil est estompée autour.
- **Plusieurs éléments à la même heure** se placent côte à côte. Une habitude avec rappel ce jour-là est une fine marque à l'heure du rappel ; un clic ouvre l'habitude.

## L'ordre du jour

### Heures et ordre

La liste classe d'abord les tâches **avec une heure** (créneau ou échéance horaire) par ordre horaire, puis les autres dans l'ordre du plan. « À caser · N » regroupe celles sans heure, en tête celles dont l'heure est **passée sans être faite** (« Prévue 10:30 » : rien ne disparaît). « Ma journée » alterne tâches et rendez-vous dans l'ordre du temps, avec :

- une ligne « Maintenant » à l'heure actuelle ;
- le passé estompé et la prochaine chose mise en avant ;
- « En même temps » quand une tâche chevauche un rendez-vous ;
- un **créneau libre** (« 45 min libres ») avec « Caser les N ici » quand des tâches sans heure y tiennent.

### Ranger la journée à la main

Glissez une ligne sur une autre : elle prend sa place (champ synchronisé `today_order`). Ce qui est rangé à la main passe d'abord, le reste suit l'heure puis le classement. Sur Android, la même chose passe par « Monter » et « Descendre ».

- **Réordonner les lignes qui ont une heure réordonne la journée** : les tâches prennent à tour de rôle les heures de la journée, chacune après la précédente et à l'écart des rendez-vous et du temps protégé.
- Une ligne sans heure déposée entre elles reçoit un créneau ; une ligne avec une heure déposée parmi les autres la perd.
- **Glisser une ligne sur le calendrier** lui donne un créneau (une tâche prévue un autre jour passe à ce jour). Les créneaux avancent par pas de 15 minutes. Glisser un bloc le déplace ; tirer son bord inférieur le redimensionne (durée de **cette ligne de plan seulement** : l'estimation de la tâche ne change pas) ; le remettre sur la liste lui retire l'heure. Au clavier, Maj ou Alt + flèches sur un bloc sélectionné.
- Le glisser a des garde-fous : « Chevauche » et « Dans le passé » s'affichent quand on lâche sur un endroit refusé.

### Quand un créneau est dépassé

Quand l'heure de fin d'une tâche non terminée est passée, un bandeau dit « *nom* a dépassé son créneau » avec **« Décaler la suite »** (la tâche reprend à maintenant et les suivantes se décalent juste ce qu'il faut) et **« Plus tard »** (cette tâche seule est replacée au prochain créneau libre, sinon sans heure). Les deux proposent « Annuler ».

### Organiser

Le bouton **« Organiser »** (visible quand des tâches sans heure tiennent dans le temps libre) place chaque tâche sans heure dans le temps libre des heures de travail, **dans l'ordre de la liste**, autour des événements, du temps protégé et des rendez-vous ; sur aujourd'hui, à partir de maintenant. Un message « N tâches placées » propose **« Annuler »** qui remet tout le plan d'avant. Une tâche qui ne tient nulle part reste sans heure.

## Le plan du jour : cinq notions, cinq champs

Cadence distingue ce que les autres outils mélangent. Rien dans Aujourd'hui ne change l'échéance : glisser, redimensionner, reporter et organiser ne touchent qu'au plan.

| Notion | Donnée | Écrite par |
|---|---|---|
| Jour prévu | La ligne de plan de ce jour | Ajouter au jour, reporter, retirer du jour |
| Échéance | `tasks.due_date` (et l'heure) | Seulement le champ « Échéance » (fiche, menu) |
| Créneau | L'heure de la ligne de plan | Glisser dans le calendrier, déplacer, retirer l'horaire |
| Durée | L'estimation de la tâche, copiée dans la ligne | Redimensionner un bloc (ligne seulement), puces de durée, fiche |
| Rappel | `reminder_at` | La fiche |

### Règles à connaître

- **Un seul jour prévu par tâche.** Mettre une tâche sur un jour (à partir d'aujourd'hui) la retire de tous les autres jours à partir d'aujourd'hui. Les jours passés gardent leurs lignes comme historique.
- **Retirer l'horaire garde la tâche dans la journée** ; **retirer de la journée garde la tâche** (elle redevient « sans jour »).
- **Reporter à demain ou à la semaine prochaine** déplace la ligne de plan (ou prévoit sur ce jour une tâche seulement due) ; l'échéance ne change jamais depuis cette page, et un repère rappelle l'échéance sur son jour. Chaque écriture propose « Annuler ».
- **Les écritures sont atomiques et protégées.** Chaque changement est appliqué à l'écran tout de suite et envoyé avec l'empreinte du plan ; si un autre appareil l'a modifié entre-temps, la page se recharge avec « Le plan a changé sur un autre appareil. Il a été rechargé. » plutôt que d'écraser. Un échec d'enregistrement revient en arrière (« Échec de l'enregistrement. Rien n'a changé. »).
- **Une échéance repoussée fait quitter la journée.** Une tâche simple dont l'échéance passe à un jour plus tardif quitte les plans des jours qui précèdent la nouvelle échéance (à partir d'aujourd'hui), quelle que soit l'origine du changement (fiche, synchronisation, agent). Un plan à partir de la nouvelle échéance reste, de même qu'un plan passé. Pour une récurrente ou une habitude, la question « cette occurrence ou la série ? » propose « Retirer aussi de ma journée » (cochée).
- **Option « Planifier change l'échéance »** (Profil › Organisation › Planification › Échéance, désactivée par défaut ; Android : Réglages › Planification › Échéance). Quand elle est active, mettre une tâche sur un jour (à partir d'aujourd'hui) met aussi son échéance à ce jour : fin de journée, ou la même heure le nouveau jour si l'échéance en avait une. Les récurrentes, les habitudes et les tâches closes gardent la leur. L'activer aligne d'un coup les tâches déjà planifiées ; la désactiver ne change rien. Seul ce sens existe : changer une échéance ailleurs ne bouge pas le plan, sauf la règle précédente.

## Les tâches en retard

Le pli **« En retard · N »** (aujourd'hui seulement) liste toutes les tâches ouvertes dont l'échéance est passée et qui ne sont prévues sur aucun jour à partir d'aujourd'hui. Les tâches échues prévues un jour plus tard y figurent aussi, avec ce jour (« Prévue jeu. 28 »). Ce sont de vraies lignes de tâche : case, glisser vers la liste ou le calendrier, menu avec « Aujourd'hui ». Une tâche posée sur la journée quitte la liste.

- **« Aujourd'hui »** sur une ligne et **« Tout reprendre aujourd'hui »** les prévoient sur la journée sans toucher l'échéance.
- **« Replanifier »** ouvre une feuille où chaque tâche échue reçoit un choix en un toucher : Aujourd'hui, Demain, Fait, ou « Plus… » (les cinq jours suivants avec leur charge, les horizons Cette semaine, Semaine prochaine, Ce mois-ci, Plus tard, « Choisir une date… », « Abandonner »). Chaque choix est écrit tout de suite, la ligne garde son choix et propose « Annuler ». Une tâche replacée n'est plus en retard : **ce choix, contrairement aux gestes de la page, change l'échéance** (jour choisi, ou échéance vidée pour un horizon).
- **« Tout à demain »** et **« Étaler sur 7 jours »** (même règle que dans Planifier, plus bas) traitent toutes les tâches d'un coup.
- Une tâche **récurrente** ne peut qu'être terminée (« Fait ») ou ignorée (« Passer cette fois ») ; une tâche d'un fichier `TODO.md` ne peut pas être abandonnée (voir [Projets TODO.md](Projets-TODO-md)). « Abandonner » passe la tâche en « Annulé ».
- Un chiffre de retard n'est jamais affiché comme un reproche : le pli dit « En retard · 3 », pas « 3 jours ».

## Demain et Suggestions

- **« Demain · N »** liste ce qui est prévu ou dû demain (même fonction que pour la journée, sans doublon avec la liste). « + » ou un glissement sur le calendrier le prend pour le jour affiché.
- **« Suggestions · N »** regroupe ce qui pourrait venir ensuite (cette semaine, « en vue », le reste), sans les tâches déjà dans la journée, en retard ou en « Demain ». Chaque ligne montre son projet et ses deux premières étiquettes en puces, la date, puis « Ajouter » : on voit d'où vient la suggestion sans l'ouvrir. Une routine due plus tard n'est pas suggérée : elle revient toute seule.
- Ce qui est suggéré se règle dans Profil › Organisation › Planification (voir plus bas).

## Les habitudes du jour

Une section **« Habitudes · N »** de la liste montre les habitudes prévues ce jour-là.

- **Un toucher** coche une habitude oui/non, ou ajoute sa première valeur rapide (sinon une unité), avec « Annuler » (un message « Impossible d'enregistrer l'habitude. » s'affiche en cas d'échec).
- Celles qui sont faites se replient dans **« Faites · N »** et suivent « Masquer les terminées ».
- Une habitude dont un rappel tombe ce jour-là est une fine marque sur le calendrier, à l'heure du rappel ; un clic ouvre l'habitude.
- Les détails du suivi (séries, valeurs, pauses) sont dans [Habitudes](Habitudes). Sur Android, les habitudes sont dans « Ma journée ».

## Ce qui apparaît ou disparaît

| Cas | Résultat |
|---|---|
| Tâche prévue aujourd'hui | Dans « À caser » ou « Ma journée » |
| Tâche due aujourd'hui, jamais prévue | Dans la journée (une seule fois) |
| Tâche due aujourd'hui mais prévue demain | Dans « Demain », pas aujourd'hui |
| Tâche échue prévue plus tard | Dans « En retard », avec son jour |
| Tâche échue non prévue | Dans « En retard » |
| Tâche sans date ni plan | Ni dans la journée ni dans les replis, sauf comme suggestion |
| Tâche avec « Différer jusqu'à » à venir | Absente tant que le report n'est pas échu |
| Tâche terminée | Dans « Terminées · N » (50 plus récentes) ou masquée |
| Tâche étiquetée `today` | Elle compte parmi les candidats prioritaires des suggestions |
| Tâche tagguée `someday` (Plus tard) | Jamais ajoutée pour remplir une liste trop courte |
| Sous-tâche avec sa propre date | Sous le nom du parent |

## Réglages

Dans Profil › Organisation › Planification (Android : Réglages › Planification) :

- **Ordre** des candidats : dix groupes (taguées « aujourd'hui », en retard, dues aujourd'hui, en cours, le reste, chacun scindé en tâches de projet et tâches sans projet), réordonnables par glisser ou flèches ; « Rétablir par défaut ». Dans un groupe : priorité la plus haute d'abord, puis l'ordre des lignes, puis l'échéance, puis la plus récemment modifiée (ou la plus récente, ou la plus ancienne).
- **Suggestions** : statuts de projet suggérés (par défaut « En cours »), tâches sans projet oui ou non, projets jamais suggérés, tâches non modifiées depuis 3 ou 6 mois écartées, horizon de 1, 3 ou 7 jours, nombre de suggestions (10, 20 ou 50). Ces filtres ne touchent que « le reste » : les tâches en retard, dues aujourd'hui ou en cours s'affichent toujours.
- **Votre journée** : heures de début et de fin (par défaut 8 h à 18 h, pas de 30 minutes) ; les nouvelles tâches et les brouillons IA y reçoivent une heure.
- **Échéance** : « Planifier change l'échéance » (voir plus haut).
- **Replanification des retards le matin (IA)** : une proposition de semaine préparée à l'heure choisie quand des tâches sont en retard (voir [IA et propositions](IA-et-propositions)).
- **Temps de concentration** : blocs récurrents (jours et heures, libellé facultatif) que « Organiser », le bouton « + » et le brouillon IA n'utilisent jamais, avec des exceptions (vacances, congé) ; on peut toujours y glisser une tâche à la main. Ils s'éditent sur Android dans Réglages › Planification ; sur le web, depuis l'ancienne page Aujourd'hui (voir ci-dessous).

### L'ancienne page

Le menu « ⋯ » d'Aujourd'hui garde l'entrée **« Ancienne page Aujourd'hui »** pendant la migration (`?classic=1`). Elle porte encore la jauge de capacité, « Placer tout », le guide « Commencer ma journée », le bilan du soir, la citation du jour (« Afficher la citation du jour ») et l'édition des temps de concentration.

## Planifier

![Planifier : boîte de réception, jours et horizons](images/web/plan.png)

**Planifier** (barre latérale ou `g` puis `u`) est un tableau à la Todoist : à gauche tout ce qui n'a pas encore de jour, au milieu **une colonne par jour** sur deux semaines, puis un calendrier à droite. Un bouton à deux positions bascule entre **« Jours »** et **« Horizons »**. Les écritures de Planifier touchent le **plan**, jamais l'échéance (sauf les choix explicitement sur la date, comme dans la fiche).

### Le tableau des jours

- Chaque colonne affiche le jour, sa date et, **seulement quand quelque chose est prévu**, le nombre de cartes, la charge (« 2 h 30 / 10 h », en rouge au-delà) et la barre « Faites ». Un jour vide reste blanc.
- Les cartes sont celles de tâche (case, titre, puces). Faites glisser une carte sur un jour pour la planifier ; sur un horizon pour l'engager ; sur la barre latérale pour la classer.
- **« Aujourd'hui »** n'est jamais grisé : sur aujourd'hui, il ramène la colonne du jour dans la vue. Les boutons « Aller à la date », « Jour précédent/suivant », « Semaine précédente/suivante » font défiler.
- Le bouton **« Affichage »** règle : Disposition, Regrouper par (Aucun, Projet, Priorité, Étiquette), Trier par (Ordre du plan, Heure, Priorité, Nom, Projet), « Tâches terminées », « Colonne Boîte de réception », « Jours du calendrier » et « Réinitialiser ». **« Filtrer »** restreint par projets, étiquettes ou priorité (« Effacer les filtres »).
- **Calendrier** : à côté du tableau dès 1180 px de fenêtre quand le tableau garde sa colonne d'inbox, un jour et demi de colonnes et le calendrier le plus étroit (280 px) ; sinon c'est un tiroir (« Fermer le calendrier »). Le bouton **« Calendrier fusionné »** montre les événements d'agenda dans les colonnes des jours, en cartes (icône à la couleur de l'agenda, titre, heure ou « Toute la journée »), dans l'ordre de l'heure parmi les tâches, et masque le calendrier latéral.

### La colonne de gauche, dans l'ordre du temps

Une seule liste, du plus pressant au plus lointain (depuis le 19 novembre 2026) :

1. **« En retard (N) »** : les tâches échues sans plan à partir d'aujourd'hui. Elle tient sur une ligne (« En retard (N) » et les boutons) et s'ouvre par un chevron. Son bouton partagé **« Replanifier »** écrit des lignes de plan, jamais l'échéance, avec un seul « Annuler » :
   - le tri se fait par priorité (haute, moyenne, basse, aucune), puis par échéance la plus ancienne ;
   - un jour de sa **fenêtre** : aujourd'hui et demain pour une priorité haute, d'aujourd'hui à aujourd'hui + 3 pour une moyenne, d'aujourd'hui à aujourd'hui + 6 pour les autres ; jamais avant le début ni le report de la tâche ;
   - on choisit le jour **le moins chargé** de la fenêtre (le plus tôt en cas d'égalité), la charge comptant l'estimation de chaque ligne de plan (30 minutes sans estimation) ; sans jour possible dans sa fenêtre, la tâche va au premier jour permis des sept ; sans aucun, elle reste en retard ;
   - le message nomme le dernier jour utilisé (« réparties jusqu'à samedi »).
   Le menu **▾ « Toutes le même jour »** propose Aujourd'hui, Demain ou « Choisir une date… ». Si un agent écoute, « Replanifier avec l'IA » lance la proposition de semaine (voir [IA et propositions](IA-et-propositions)).
2. **« À replanifier »** (en rouge) : les tâches dont la semaine ou le mois d'engagement est passé, sans plan à partir d'aujourd'hui et placées dans aucun horizon.
3. **« Repoussées »** : les tâches déplacées trois fois ou plus ces 30 jours (« 4× en 30 jours »). Un clic ouvre un menu : Voir la tâche, Faire aujourd'hui, Découper en étapes, Plus tard, Marquer comme faite, Abandonner, Garder tel quel. Chaque choix est une décision de revue et remet le compteur à zéro. Leurs cartes ailleurs portent un badge « ↻ 4× ». Voir [Revue, bilan et focus](Revue-bilan-et-focus).
4. **La boîte de réception** : les tâches « à classer » puis les idées (voir [Boîte de réception et capture](Boite-de-reception-et-capture)). Sa largeur se règle (220 à 560 px, double-clic pour revenir à 260 px).
5. **Les horizons** : Cette semaine, Semaine prochaine, Ce mois-ci, Le mois prochain, Un jour. Chaque section se replie par son titre (état gardé ; « Un jour » démarre replié), reçoit des cartes déposées et les donne à un jour. La section « Cette semaine » affiche la charge de la semaine restante (« 6 h 30 / 35 h »).

Une tâche déjà sur un jour du tableau (prévue ou due) n'est pas listée une seconde fois.

### Les horizons

Un horizon est un **engagement sans jour fixe**. En mode « Horizons », cinq colonnes encadrées : Cette semaine, Semaine prochaine, Ce mois-ci, Le mois prochain, Un jour. Une tâche tombe dans le premier horizon qui s'applique :

1. **Un jour** : elle porte l'étiquette `someday`, quoi qu'elle ait d'autre.
2. **Son engagement** : `week_of` de cette semaine (Cette semaine), de la suivante (Semaine prochaine), `month_of` de ce mois ou du suivant.
3. **Sa date, déduite** (rien n'est écrit) : sa plus ancienne ligne de plan depuis le début de la semaine, sinon son échéance à venir. Un jour de cette semaine donne Cette semaine ; un jour ultérieur de ce mois, Ce mois-ci ; un jour du mois suivant, Le mois prochain. « Semaine prochaine » est toujours un engagement, jamais déduit.

Une semaine ou un mois passé, une échéance passée ou un plan sur une semaine antérieure ne décident de rien : la tâche n'est alors dans aucun horizon. Déposer une carte sur un autre horizon écrit `week_of`, `month_of` ou l'étiquette `someday`, la date déduite restant intacte. Les raccourcis **Maj+W** (semaine prochaine) et **Maj+M** (ce mois-ci), le clic droit (« Envoyer vers un horizon ▸ ») et la bande de dépôt font de même ; la tâche quitte alors son jour de plan, l'échéance est conservée et un seul « Annuler » rétablit tout. Depuis la fiche d'une tâche, la ligne **« Plus tard »** du sélecteur d'échéance fait la même chose.

Le clic droit propose aussi **« Engager pour »** (Cette semaine, Semaine prochaine, Ce mois-ci, Mois prochain, Un jour) et « Retirer l'engagement ».

### Poser une tâche : « → sam. 21 »

Une carte de la boîte de réception, de « Cette semaine », de « Semaine prochaine » ou de « Ce mois-ci » porte un petit bouton « → sam. 21 » : le **premier jour du tableau** dont le temps libre (les heures du jour moins les lignes de plan ouvertes ; pour aujourd'hui, ce qu'il en reste) contient l'estimation de la tâche (30 min sans estimation). Un clic la planifie là (une ligne de plan, un « Annuler »). Pas de bouton quand aucun jour n'a de place.

### Sélection multiple

Ctrl, Cmd ou Maj + clic choisissent plusieurs cartes (disposition Jours seulement) : une barre en bas dit « Sélection : N » avec Aujourd'hui, Demain, Semaine prochaine, Ce mois-ci et ✕. Glisser une carte choisie déplace tout le groupe ; `T`, Maj+T, Maj+flèches, Maj+W et Maj+M agissent sur toute la sélection, avec une écriture par jour touché et un seul « Annuler ». Échap ou ✕ vide.

### Planifier ma semaine (IA)

Quand un agent écoute, un onglet « Planifié par l'IA » apparaît à côté de Jours et Horizons dès qu'une proposition de semaine est prête : bandeau « Proposition de l'IA », cartes violettes pour ce qu'elle déplace et traits pointillés pour où la tâche est maintenant, décision carte par carte, puis « Appliquer (N) ». Rien n'est écrit avant. Voir [IA et propositions](IA-et-propositions).

### Raccourcis de Planifier

Visibles dans l'aide `?`, groupe « Sur la page Planifier » :

| Touche | Action |
|---|---|
| `N` | Ajouter à la boîte de réception |
| Flèches ou `H` `J` `K` `L` | Passer d'une carte ou d'un jour à l'autre |
| Maj+← / Maj+→ | Déplacer la carte (ou la sélection) d'un jour |
| `T` / Maj+T | La planifier aujourd'hui / demain |
| Maj+W / Maj+M | L'envoyer à la semaine prochaine / ce mois-ci |
| `M` | La prendre pour la déplacer aux flèches (Entrée la pose, Échap annule) |
| Ctrl, Cmd ou Maj + clic | Sélectionner plusieurs cartes |
| Échap | Vider la sélection |

## Sur Android

- **Aujourd'hui** : le titre de l'onglet Tâches est la liste ouverte (« Aujourd'hui ▾ ») et ouvre le sélecteur de listes. La page est une **ligne du temps compacte** : « À caser » (sans heure, avec « prévue 10:30 » pour celles dont l'heure est passée), puis « Ma journée » (journée entière en tête, passé atténué avant le trait « maintenant », prochaine chose en gras avec « dans X », « en même temps » en ambre, créneau libre de 30 minutes ou plus avec « Caser les N ici »). Demain et Suggérées sont repliés sous la journée. « N à faire » ou « N faites sur M » sous la date.
- **Glisser** : appui long puis glisser sur une tâche (échues comprises) : un trait à l'accent et une étiquette (« 18:30 » ou « À caser ») disent où elle tombe, au quart d'heure, jamais avant maintenant. Relâchée sans bouger, elle ouvre son menu. « Monter » et « Descendre » sont dans le menu.
- **Échues** : un bandeau « N tâches échues » avec **« Replanifier »** ouvre la feuille complète (Aujourd'hui, Demain, Fait, « Plus… » : cinq jours suivants avec leur charge, Cette semaine, Semaine prochaine, Ce mois-ci, Plus tard, Choisir une date, Abandonner ; « Tout à demain » et « Étaler sur 7 jours » en tête ; pour une série, « Passer cette fois »).
- **Planifier** (sélecteur de listes, ex-« À venir ») : le même tableau en une colonne : Inbox (« Tâches à classer » puis idées ; « Ajouter » crée une tâche), « Échues » (« Tout à aujourd'hui »), **14 jours** avec leur charge ou les **quatre horizons**, une bande « Plus tard ». Un **appui long** sur une tâche ouvre la feuille « Planifier » : un jour, un horizon (la carte quitte son jour), « Retirer de ce jour », ou le menu habituel. Les plans des 14 jours sont lus après chaque synchronisation et gardés sur le téléphone : le tableau marche hors ligne et chaque écriture est mise en file, avec « Annuler ».
- **Rien n'écrit l'échéance** depuis Planifier ou « Reporter » : un report déplace la tâche du plan d'aujourd'hui vers le jour choisi, « Plus tard » pose l'étiquette `someday` et garde l'échéance.
- **Rappel d'une tâche placée** : une tâche placée à une heure dans le plan sonne à cette heure (voir [Notifications et rappels](Notifications-et-rappels)).

Pour le détail des plans côté téléphone, voir [Android](Android).

## Raccourcis

| Touche | Action |
|---|---|
| `g` puis `t` | Aller à Aujourd'hui |
| `g` puis `u` | Aller à Planifier |
| Flèches haut/bas, Entrée, Espace, `D`, `P` | Sur une ligne (voir [Tâches](Taches)) |
| Clic droit ou touche Menu | Menu de la ligne |
| Maj ou Alt + flèches | Déplacer ou redimensionner un bloc du calendrier sélectionné |
| Échap | Fermer la fiche |

## Pour aller plus loin

- [Plan du jour et calendrier](https://github.com/PreciselyWrong/cadence/blob/main/docs/20-daily-plan.md)
- [Sections d'Aujourd'hui](https://github.com/PreciselyWrong/cadence/blob/main/docs/02-today-page-sections.md)
- [Planifier, horizons et retards](https://github.com/PreciselyWrong/cadence/blob/main/docs/03-upcoming-view.md)
- [Refonte d'Aujourd'hui (conception)](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/TODAY-REDESIGN.md)
- [Notes UX web](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/WEB-UX-NOTES.md)
- [Notes UX Android](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/ANDROID-UX-NOTES.md)
