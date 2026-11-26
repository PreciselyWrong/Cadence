# Tri des mails

Les mails qui demandent quelque chose de vous arrivent dans Cadence sous forme de **cartes** : vous décidez en un geste (créer une tâche, répondre, mettre un rendez-vous à l'agenda, reporter, archiver, ignorer), sans quitter Cadence et sans ouvrir votre boîte mail.

![Le deck « Trier mes mails »](images/web/mail-deck.png)

## Ce que c'est, et ce que ce n'est pas

Cadence **n'est pas un client mail**. Il n'affiche jamais un message HTML, n'envoie jamais rien, n'a pas de pièces jointes et ne parle à Gmail que pour archiver un fil quand vous le demandez. Le travail de lecture est fait par un **agent externe** (un plugin ou un travail planifié, voir [Integrations-MCP-et-plugins](Integrations-MCP-et-plugins)) qui lit votre boîte, prépare éventuellement un brouillon, puis **propose** une carte pour chaque fil qui demande une action. Cadence stocke la carte, vous la montre, enregistre votre décision. L'agent exécute ensuite la suite (créer le brouillon, archiver, créer l'événement) et rapporte son résultat.

Principes qui ne changent pas :

- **L'agent propose, vous décidez.** Une carte ne change rien tant que vous ne l'avez pas décidée.
- **Seulement les mails qui demandent une action** (une réponse, une tâche, une décision). Les lettres d'information, notifications et reçus ne deviennent jamais des cartes.
- **Une carte par fil de discussion.** Un nouveau message dans un fil déjà en attente met la carte à jour ; un fil déjà décidé ne reçoit une nouvelle carte que si un nouveau message arrive *après* votre décision.
- **Le texte est du texte.** Expéditeur, objet, résumé, mail complet et brouillon s'affichent en texte brut : pas de Markdown, pas de lien, les caractères de contrôle et ceux qui masquent ou réordonnent du texte sont supprimés. Le seul lien est celui qui ouvre le fil dans Gmail.
- **Courte durée de vie.** Une carte décidée est supprimée 30 jours plus tard.

Sans agent externe, il n'y a tout simplement pas de cartes de mail : aucun bouton ne s'affiche.

## Où les trouver

| Entrée | Effet |
|---|---|
| Notification « 1 mail à trier » / « N mails à trier » | Arrive environ 2 minutes après la dernière carte d'une série (un seul message pour toute la salve). Sur le web, elle ouvre le deck. |
| **À trier (n)** dans l'en-tête de la boîte de réception, ou en haut de « Ma journée » sur Android | La file « À trier », où les cartes de mail sont en liste. |
| Bouton **Trier mes mails (n)** en haut de « À trier » | Ouvre les cartes en **deck plein écran**, une à la fois. N'apparaît que s'il y a des cartes. |
| **Relever les mails** | Demande à l'agent de relever votre boîte tout de suite (voir plus bas). |
| **Ma matinée** (Android) | Commence par le deck de mails s'il y en a, puis enchaîne sur les retards et la journée. |

![La file « À trier »](images/web/triage.png)

## Une carte

| Contenu | Détail |
|---|---|
| Expéditeur et date | Date du dernier message du fil |
| Objet | « (sans objet) » s'il est vide |
| Résumé | 2 à 3 lignes (500 caractères au plus), avec les retours à la ligne : qui écrit, de quoi il s'agit, que faire et pour quand |
| Mail complet | En texte brut nettoyé par le serveur (20 000 caractères au plus), **replié** sous « **Lire le mail** » ; le bouton le déplie puis devient « Réduire ». Sur la carte, le texte est lisible sans quitter Cadence. |
| Rendez-vous | Quand le mail fixe une réunion : titre, début, fin, lieu |
| Brouillon | Début (280 caractères) de la réponse déjà préparée, et le texte complet cité dans le deck |
| Ouvrir dans Gmail | Le seul lien : il n'est accepté que s'il pointe vers Gmail |

## Les décisions

Chaque carte offre 2 à 5 décisions, dans l'ordre choisi par l'agent. L'une est **conseillée** : encadrée et teintée, jamais présentée comme une phrase.

| Décision | Effet |
|---|---|
| **Tâche** | Crée une tâche : nom et date (ou horizon) pré-remplis depuis la suggestion, note avec le résumé et le lien Gmail, origine « Gmail » (badge). Un seul geste si la suggestion vous convient. |
| **Brouillon** | Demande à l'agent de créer le brouillon de réponse dans Gmail. La carte indique « Brouillon en préparation dans Gmail ». Cadence ne touche pas à Gmail lui-même. |
| **Répondre** | Ouvre le fil (ou le brouillon) dans Gmail. L'envoi se fait toujours dans Gmail, par vous. N'existe que sur les cartes anciennes ou quand l'agent le propose. |
| **Agenda** | Un rendez-vous que l'agent doit mettre dans votre agenda Google : « Rendez-vous demandé à l'agent ». Refusé sans heure de début. |
| **Plus tard** | La carte revient demain 08:00 (fuseau de votre profil), ou à la date choisie. |
| **Archiver** | Demande à l'agent d'archiver le fil : « Archivage demandé ». |
| **Supprimer** | Demande à l'agent de mettre le fil à la corbeille Gmail : « Suppression demandée ». |
| **Ignorer** | La carte est terminée, rien d'autre. |
| **Répondre par un mot** | Une remarque (500 caractères) pour l'agent. La carte quitte le deck (« Renvoyé au Trieur ») et sera reproposée, corrigée, à son prochain passage. |

**Archiver en plus.** Avec Tâche, Répondre, Agenda ou Ignorer (pas avec Brouillon, Plus tard ni Archiver, qui archive déjà), une case « Archiver dans Gmail » (décochée) archive aussi le fil. Elle n'existe que si la passerelle Gmail est configurée sur le serveur ; sans elle, rien ne sort de Cadence vers Gmail.

**Si l'action échoue.** L'agent rapporte son résultat. En cas d'échec (par exemple « Le brouillon n'a pas pu être préparé »), la carte **se rouvre** avec l'erreur en haut, et vous pouvez rappuyer. Un échec d'archivage affiche « Pas archivé dans Gmail » : la décision, elle, reste enregistrée.

**Créer la tâche : les horizons.** Quand le mail ne donne pas de jour, la suggestion peut ranger la tâche sur un horizon (Cette semaine, Semaine prochaine, Ce mois-ci, Mois prochain, Un jour). « Modifier la tâche » ouvre le formulaire : nom, date, et ces cinq puces ; choisir une date efface l'horizon, et réciproquement.

## Le deck « Trier mes mails »

Plein écran, une carte à la fois.

- **En-tête** : progression « 4 / 17 » avec une fine barre (cartes décidées depuis l'ouverture).
- **Carte** : expéditeur · date, objet, résumé, rendez-vous éventuel, mail complet replié, « Ouvrir dans Gmail », brouillon cité.
- **Une rangée de 2 à 5 gros boutons** dans l'ordre de l'agent (Brouillon, Répondre, Tâche, Agenda, Plus tard, Archiver, Supprimer, Ignorer, avec leurs icônes). Le conseil est encadré ; le bouton **Tâche** affiche le nom de la tâche proposée, **Agenda** l'heure.
- **Dessous, discrets** : « Répondre par un mot », « Discuter » (ouvre la conversation avec l'agent sur cette carte, seulement si un plugin d'agent est en marche), « Passer » (la carte va en bas du paquet), « Annuler », « Ouvrir le mail ».
- **Après chaque décision**, la carte part avec une courte animation (aucune si vous avez demandé moins de mouvement), la suivante arrive. **La dernière décision attend un instant** avant d'être envoyée, pour que « Annuler » la rende : sur le web jusqu'à la décision suivante, 5 secondes ou la fermeture du deck ; sur Android pendant la fenêtre d'annulation de 4,5 secondes, y compris hors ligne.
- **Fin** : « Tout est trié » et un bouton « Retour à « À trier » ».

**Ordre des cartes** : d'abord celles dont le conseil est un rendez-vous, puis un brouillon ou une réponse, puis une tâche, puis le reste ; les plus récentes d'abord dans chaque groupe.

**Raccourcis (web)**

| Touche | Action |
|---|---|
| Entrée ou → | Suivre le conseil (rien si l'agent n'en donne pas) |
| 1 à 5 | Choisir ce bouton |
| ← | Plus tard |
| ↓ | Passer |
| Ctrl ou ⌘ + Z | Annuler la dernière décision |
| Échap | Fermer le deck (ou le formulaire de tâche) |

Les touches sont ignorées pendant que vous saisissez dans un champ.

**Android** : glisser à droite suit le conseil, glisser à gauche remet à plus tard (aussi disponibles en actions personnalisées pour TalkBack) ; retour ferme le deck.

**Gmail depuis le téléphone.** Android ouvre Gmail **dans le navigateur** (le site mobile), pas dans l'application : l'application Gmail ignore l'adresse du fil et ouvre sa boîte de réception.

## Archiver le bruit en un geste

Quand le deck s'ouvre avec au moins deux cartes dont l'agent conseille l'archivage, il commence par un écran « **N mails à archiver** » : une ligne par mail (expéditeur · objet, résumé), tous cochés, avec **Archiver les N** et **Les voir un par un**. Les cartes décochées restent dans le deck. L'écran n'apparaît qu'une fois par ouverture. Il n'y a pas d'annulation : la liste cochée est la confirmation, et un fil archivé reste dans « Tous les messages » de Gmail.

## Toujours archiver cet expéditeur

Sur une carte (deck ou liste), « **Toujours archiver cet expéditeur** » enregistre une règle pour l'adresse (en minuscules) et archive la carte. Ensuite, un mail de cet expéditeur n'a **plus de carte** : il est archivé directement au prochain passage de l'agent, sans notification. Les règles se gèrent dans Profil › À trier (« Expéditeurs toujours archivés », bouton « Retirer ») et dans Réglages › À trier sur Android (« Expéditeurs archivés automatiquement »). Hors ligne, la liste est indisponible.

## Relever les mails maintenant

Le bouton **Relever les mails** (à côté de « Trier mes mails », même sans carte, et à la fin du deck ; web et Android) demande à l'agent de lancer son travail de relevé tout de suite. Les nouvelles cartes arrivent comme d'habitude, avec la notification « N mails à trier ».

| Cas | Résultat |
|---|---|
| Appui normal | « C'est lancé. » ; les cartes arrivent en une minute environ |
| Un relevé est déjà en cours, ou a démarré il y a moins de 2 minutes | Pas de second lancement |
| Rien de nouveau | L'agent n'est pas réveillé : un appui pour rien ne consomme rien |
| Hors ligne | Jamais mis en file : un relevé rejoué plus tard lancerait du travail que personne ne demandait à ce moment-là |

Le bouton peut afficher la dernière exécution (« relevé à 9 h 12 », « en cours... »).

## Conflits, hors ligne, cas limites

| Situation | Ce qui se passe |
|---|---|
| Vous décidez sur le web et le téléphone en même temps | La carte est « prise » avant le travail : la première décision gagne, l'autre affiche « Déjà traité ailleurs. » |
| Même décision envoyée deux fois (réseau instable) | Traitée comme faite, sans doublon (clé d'idempotence) |
| Décision hors ligne sur Android | Rejouée au retour du réseau, une seule fois |
| Une décision échoue | La carte revient dans le deck |
| Le serveur plante au milieu d'une décision | La carte est de nouveau libre après 5 minutes |
| Plusieurs cartes arrivent d'un coup | Une seule notification pour la salve |
| Une carte est ouverte sans connexion (Android) | La dernière file est lisible hors ligne ; les décisions partent plus tard |
| Les cartes d'un compte à l'autre | Chaque carte est privée à son compte |

## Les écrans de la liste « À trier »

Les cartes de mail de la liste montrent les mêmes boutons que le deck (le conseil encadré). Sur le web : sujet en titre, expéditeur et date, résumé, extrait de brouillon ; bouton principal Répondre quand l'agent suggère une réponse, Tâche sinon.

## Pour aller plus loin

- [Mail cards in « À trier »](https://github.com/PreciselyWrong/cadence/blob/main/docs/43-mail-triage.md) (contrat complet de l'agent)
- [La file « À trier »](https://github.com/PreciselyWrong/cadence/blob/main/docs/40-triage.md)
- Pages liées : [IA-et-propositions](IA-et-propositions), [Boite-de-reception-et-capture](Boite-de-reception-et-capture), [Notifications-et-rappels](Notifications-et-rappels), [Android](Android)
