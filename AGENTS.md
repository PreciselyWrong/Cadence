# AGENTS.md

## Quoi
Cadence est une application Android locale de suivi d'habitudes, destinée à une saisie quotidienne très rapide.
Le widget compact et l'Activity de saisie rapide sont les surfaces principales.
Aucun compte, serveur, tracker marketing, publicité ou accès réseau applicatif.

## Échanges
Réponses low verbose : l'essentiel, sans préambule ni récapitulatif de ce qui vient d'être lu.
Lister ce qui a changé et ce qui reste, pas la démarche.

## Commandes
| But | Commande |
|---|---|
| Tests domaine | `$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; .\gradlew.bat :domain:test` |
| Build debug | `$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; .\gradlew.bat :app:assembleDebug` |
| Préparer le développement | `.\dev.ps1 -Plan -NonInteractive` |
| Lancer sur un appareil ADB | `.\dev.ps1 -NonInteractive` |
| Préparer une publication | `.\publish.ps1 -Plan -NonInteractive` |

## Carte
`domain/` - calculs temporels et règles métier Kotlin sans Android.
`data/` - persistance locale, préférences et sauvegardes.
`app/` - UI Compose, widget Glance, rappels et assemblage.

## Décisions
- Min SDK 26, compilation et cible API 36.
- Une entrée garde la date civile et le fuseau observés lors de sa saisie.
- Les changements d'objectif ou de période s'appliquent à partir du jour même; les jours déjà écoulés gardent la version qui les a produits.
- Les rappels utilisent des alarmes inexactes sans permission spéciale.
- Le widget Halo est la première variante d'un système de rendu extensible. `ui/widget/WidgetRenderStyle.kt` porte le contrat - fond, encre, pastille, arrondi - lu par le widget, son aperçu et sa configuration; ajouter une variante se limite à une entrée et son libellé.
- Le widget suit la base, pas ses appelants : `WidgetAutoRefresh` écoute les révisions des tables qui le concernent et redessine après une courte fenêtre de calme. Ce qui dépend de l'heure sans écriture - minuit, entrée et sortie d'un groupe horaire - est réveillé par `WidgetBoundaryAlarm`, calculé par `WidgetRefreshSchedule`.
- La vue `Cette semaine` (`WeekOutlook`) masque une habitude dont plus aucun jour n'est planifié d'ici dimanche : la lister ne proposerait aucune action.
- Une progression recalcule la cible depuis son départ (`GoalProgression`), jamais en cumulant la valeur courante : relire une date donne toujours le même chiffre. La cadence mensuelle suit les changements de mois civils, pas le quantième.
- Un objectif porte un sens (`GoalDirection`). Sous `AT_MOST`, `targetMinor` est un maximum : la période réussit tant qu'il n'est pas dépassé, la limite ne porte ni minimum ni fréquence, et l'habitude reste offerte à la saisie tant qu'il reste de la place. Rien n'est acquis avant la fin de la période.
- La série compte des périodes planifiées réussies (`StreakCalculator`), jamais des jours calendaires. Une période sans jour planifié ou entièrement mise de côté est neutre : elle est traversée sans casser la série ni y ajouter de réussite. La période en cours ne peut pas échouer, elle n'est pas finie.
- Le temps d'un chronomètre n'est jamais stocké : `HabitTimer` garde les segments terminés et l'instant de reprise, le reste se dérive de l'horloge. Une pause fige donc le compteur et un redémarrage du processus retrouve la valeur exacte.
- Une pause porte un motif (`PauseReason`). Un saut est une pause d'un jour annulable le jour même; un voyage est une plage inclusive écourtable par reprise anticipée. Aucun motif ne casse la série et aucun rappel ne sonne pendant une pause.
- Une habitude appartient à un seul groupe. `Journée` (`HabitGroup.ALL_DAY_ID`) n'a pas d'horaire, ne se supprime pas et récupère les habitudes d'un groupe supprimé.
- `HabitGoal.targetMinor` est l'idéal, `minimumMinor` le seuil qui valide la période et la série; sans minimum les deux se confondent. `validatesPeriod` porte la série, `isCompleted` l'idéal.
- Les plages de groupes peuvent se chevaucher et traverser minuit; une plage dont la fin égale le début couvre l'horloge entière.
- Plus Jakarta Sans est embarquée localement; aucune police n'est téléchargée à l'exécution.
- `app-release/version.json` est l'unique source de version lue par le build Android.
- L'interface suit un design system unique - `ui/theme/Tokens.kt` (espacements, rayons, élévations, tailles, durées), `ui/theme/Color.kt` (palette Cadence) et `ui/components/` (surfaces, contrôles, navigation, modal). Aucune valeur d'espacement ou de couleur littérale dans un écran.
- Trois niveaux de surface au maximum : fond calme, surface fonctionnelle, élément interactif accentué. La séparation vient du contraste de surface, jamais d'une bordure.
- La signature visuelle est l'opposition extérieur doux / intérieur structuré : les surfaces sont largement arrondies, la progression d'une habitude est tracée sur une facette hexagonale (`ui/components/Facet.kt`).
- La navigation est une capsule sombre flottante à cinq cibles égales ; la destination active porte une pastille colorée, son icône et un libellé court.
- Le thème suit le réglage système clair/sombre.
- L’abstinence est un plafond quotidien à zéro, avec un profil choisi explicitement (`AbstinenceProfile`) et une date de début de suivi. Les jours terminés sans occurrence enregistrée sont dérivés par `AbstinenceStatsCalculator`; une pause interrompt la continuité et reste exclue des statistiques. La journée en cours reste distincte.
- Les repères d’abstinence distinguent objectifs personnels et observations scientifiques. Les textes et références sont embarqués (`AbstinenceGuide`, ressources `abstinence-*.xml`), les liens ouvrent le navigateur externe. Les limites des sources sont documentées dans `docs/abstinence-evidence.md`; aucun taux hormonal ni état d’organe n’est déduit du compteur.
- L'abstinence dispose d'une création et d'un détail dédiés. Le profil reste fixe après création; la date et l'heure de départ restent modifiables. Une dépense réelle facultative porte un montant en unités mineures, une cadence quotidienne, hebdomadaire ou mensuelle, et une devise choisie; le total économisé est dérivé du compteur actif, avec la durée réelle des mois. Le journal (`AbstinenceLog`) sépare les notes quotidiennes et les envies des occurrences : une note ne valide pas une journée et une envie ne casse pas la série. Une seule note est conservée par habitude et date civile.
- Les statistiques de chaque habitude (`HabitStatisticsSummary`) comptent les périodes closes dans les 30 derniers jours terminés, avec leurs versions historiques. Les pauses complètes et périodes sans planning sont neutres. Une comparaison de taux n’apparaît que pour un rythme homogène. Le calendrier hebdomadaire/mensuel montre l’activité, jamais une exigence quotidienne fictive.

## ⛔ Interdits
- ⛔ Demander « Pourquoi je fais ça » dans une abstinence — ce champ alourdit la création sans aider à enregistrer le suivi.
- ⛔ Nommer une occurrence de façon abstraite — chaque profil dit concrètement ce qui a été fait, par exemple « J’ai bu un verre ».
- ⛔ Demander un total économisé manuel ou inventer une moyenne mensuelle — l’utilisateur déclare sa dépense, sa cadence et sa monnaie; Cadence calcule avec les durées réelles.
- ⛔ Imposer la configuration des économies — un interrupteur facultatif masque le montant, la cadence et la monnaie tant que ce suivi n’est pas souhaité.
- ⛔ Coller les onglets d’une surface — un espace du design system doit séparer clairement chaque cible.
- ⛔ Ouvrir les statistiques par un agrégat abstrait de toutes les habitudes — la page commence directement par une synthèse courte pour chaque habitude.
- ⛔ Étirer la destination active de la navigation — les cinq cibles gardent la même largeur et le libellé actif reste dans la sienne.
- ⛔ Masquer le nom de l’onglet actif — son libellé court accompagne toujours l’icône sélectionnée.
- ⛔ Présenter une absence de saisie comme la preuve d’une abstinence — le bilan compte seulement les écarts notés et explique cette limite clairement.
- ⛔ Déplier le calendrier et les tendances à l’intérieur d’une carte de statistiques — la synthèse reste courte et le détail s’ouvre dans une surface dédiée.
- ⛔ Dupliquer le contenu du modal dans la page Statistiques — la page donne une lecture visuelle immédiate; le modal garde le calendrier et l’analyse détaillée.
- ⛔ Faire passer les abstinences avant les habitudes dans l’accueil ou le bilan général — le suivi des habitudes reste le cœur du produit.
- ⛔ Réduire une abstinence à une saisie d’habitude ordinaire — son accès quotidien propose d’abord un point et le journal des envies, pour accompagner le suivi.
- ⛔ Transposer les bénéfices de la cigarette au vapotage ou promettre des bénéfices hormonaux de l’arrêt de la masturbation — chaque profil doit refléter ses propres preuves.
- ⛔ Stocker une progression courante - elle doit être dérivée des entrées horodatées.
- ⛔ Réinitialiser ou supprimer des entrées à une frontière de période - les périodes sont calculées.
- ⛔ Réinterpréter l'historique après une édition - objectifs et plannings sont versionnés.
- ⛔ Utiliser `Double` pour les quantités persistées - les montants utilisent un entier et une précision explicite.
- ⛔ Confondre fréquence et quantité - ce sont deux contraintes indépendantes.
- ⛔ Ajouter des emoji - l'interface, le widget, les notifications et les données utilisent des icônes vectorielles.
- ⛔ Ajouter une permission réseau - le produit fonctionne entièrement hors ligne.
- ⛔ Ajouter une alarme exacte - le choix produit est une alarme inexacte sans accès système spécial.
- ⛔ Ajouter une dépendance ou une architecture par anticipation - chaque abstraction doit servir une tranche active.
- ⛔ Écrire un correctif métier sans test rouge préalable - la logique temporelle suit TDD.
- ⛔ Modifier la version directement dans Gradle - elle provient de `app-release/version.json`.
- ⛔ Arrêter le lancement dev sans appareil - démarrer un AVD disponible et attendre `sys.boot_completed`.
- ⛔ Considérer la gestion des habitudes complète sans édition, pause, archive, duplication, réordonnancement et suppression accessibles - un modèle persistant seul ne constitue pas une option utilisateur.
- ⛔ Masquer la sélection ou l’action principale d’un formulaire - l’icône choisie et le bouton d’enregistrement doivent rester clairement visibles.
- ⛔ Ouvrir une saisie globale depuis une icône du widget - chaque icône cible uniquement son habitude et disparaît lorsque celle-ci est terminée.
- ⛔ Placer la valeur du widget à côté de l’icône - elle s’affiche dessous et l’apparence reste configurable.
- ⛔ Cacher les options d’une habitude derrière trois points - un appui long ouvre les actions depuis Aujourd’hui comme depuis Habitudes.
- ⛔ Afficher une saisie rapide comme une pile de cartes grises - le modal porte la couleur de l’habitude et montre son historique.
- ⛔ Conserver en mémoire l’état des habitudes sans écouter les révisions de saisies et de pauses - une écriture venue du widget doit remonter immédiatement dans l’application.
- ⛔ Répéter l’unité d’une durée - `formatValue` la porte déjà (`1 h 5 min`), jamais `1 h min`.
- ⛔ Limiter la configuration d’un widget à sa création - un widget placé doit rester reconfigurable depuis le lanceur.
- ⛔ Poser une interface Compose directement sur la fenêtre système - chaque écran fournit un fond et une couleur de contenu explicites pour garantir le contraste.
- ⛔ Afficher un nom d'énumération du domaine - l'interface est intégralement en français via `strings.xml` et `HabitLabels`.
- ⛔ Écrire une valeur d'espacement, de rayon, de couleur ou de durée en dur dans un écran - tout provient de `Space`, `Radius`, `Elevation`, `Size`, `Motion` et de la palette Cadence.
- ⛔ Empiler une carte dans une carte - une unité fonctionnelle est une seule surface, la hiérarchie interne vient de la typographie et de l'espacement.
- ⛔ Bloquer le thread principal pendant une sauvegarde ou un rafraîchissement de widget - l’action affiche son avancement, confirme l’échec et ne ferme qu’après succès.
- ⛔ Nommer un planning « période flexible » sans expliquer son effet - les rythmes doivent décrire concrètement les jours où l’habitude apparaît.
- ⛔ Réduire le nombre d’icônes du widget à cause de sa hauteur - seuls les textes s’effacent lorsque l’espace vertical manque.
- ⛔ Répartir irrégulièrement les habitudes dans le widget - chaque élément occupe une largeur identique; l’alignement de l’ensemble se choisit (`WidgetSlotAlignment`), le centre n’étant que le défaut.
- ⛔ Demander explicitement un rafraîchissement du widget depuis un point d’écriture - le widget suit les révisions de la base, un appel manuel finit toujours par être oublié quelque part.
- ⛔ Aligner le contenu principal d’un modal de saisie sur un bord - titres, progression et choix rapides restent centrés.

## Pièges
- Le dépôt est initialement vide et Java n'est pas dans le PATH; utiliser le JDK embarqué d'Android Studio.
- Glance produit des RemoteViews; les anneaux déterminés doivent être rendus comme images.

## État
MVP local compilable : Room, saisie rapide, statistiques de période et widget Glance.
Rappels conditionnels, sauvegarde JSON, statistiques historiques et abstinences avec profils, conseils sourcés et journal local disponibles.
