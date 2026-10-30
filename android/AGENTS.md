# AGENTS.md

## Quoi
Cadence est une application Android locale de suivi d'habitudes, destinée à une saisie quotidienne très rapide.
Le widget compact et l'Activity de saisie rapide sont les surfaces principales.
Aucun compte, tracker marketing ni publicité. Le seul accès réseau est la synchronisation facultative des tâches avec un serveur Tududi personnel (module `tasks/`) ; les habitudes restent locales.

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
| Lancer avec les données de démonstration | `.\dev.ps1 -NonInteractive -Dummy` |
| Préparer une publication | `.\publish.ps1 -Plan -NonInteractive` |
| Linux : tests domaine | `./dev.sh --test` |
| Linux : build et lancement ADB | `./dev.sh` (`--dummy`, `--plan`) |
| Linux : tests du module tâches | `JAVA_HOME=/usr/lib/jvm/temurin-21-jdk $JAVA_HOME/bin/java -cp gradle/wrapper/gradle-wrapper.jar org.gradle.wrapper.GradleWrapperMain :tasks:testDebugUnitTest` (le `gradlew` versionné ne marche pas sous Linux) |

## Carte
`domain/` - calculs temporels et règles métier Kotlin sans Android.
`data/` - persistance locale, préférences et sauvegardes.
`tasks/` - tâches Tududi : base Room `tududi.db`, synchronisation hors ligne (`/api/v1/sync`, file d'envoi, horloges HLC), écrans, widgets Glance, rappels. Contrat : `TaskRepository`, `ServerConnection`, `TasksGraph`.
`designsystem/` - thème et composants Compose partagés par `app/` et `tasks/` : jetons, typographie, palette, accent, apparence, navigation.
`calendar/` - agendas de l'appareil en lecture seule, réglages par agenda et occurrences faites. Contrat : `CalendarRepository`, `CalendarGraph`.
`app/` - UI Compose, widget Glance, rappels et assemblage (`habits/`, `bilan/`, `agenda/`, `settings/`).
`docs/REDESIGN.md` + `docs/redesign/*.png` - refonte UI/UX 2026-10 (maquettes OpenPencil) : à suivre pour tout écran ou widget.

## Décisions
- Min SDK 26, compilation et cible API 36.
- Une entrée garde la date civile et le fuseau observés lors de sa saisie.
- Les changements d'objectif ou de période s'appliquent à partir du jour même; les jours déjà écoulés gardent la version qui les a produits.
- Les rappels utilisent des alarmes inexactes sans permission spéciale.
- Le widget Halo est la première variante d'un système de rendu extensible. `ui/widget/WidgetRenderStyle.kt` porte le contrat - fond, encre, pastille, arrondi - lu par le widget, son aperçu et sa configuration; ajouter une variante se limite à une entrée et son libellé.
- Le widget suit la base, pas ses appelants : `WidgetAutoRefresh` regroupe les révisions dans une fenêtre bornée de 60 ms dès la première écriture, sans repousser ni annuler le rendu lors de saisies continues. Ce qui dépend de l'heure sans écriture - minuit, entrée et sortie d'un groupe horaire - est réveillé par `WidgetBoundaryAlarm`, calculé par `WidgetRefreshSchedule`.
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
- L'interface suit un design system unique, le module `:designsystem` - `theme/Tokens.kt` (espacements, rayons, élévations, tailles, durées, verre), `theme/Color.kt` (palette de `docs/REDESIGN.md`, clair, sombre, noir pur), `theme/Accent.kt` (accent dérivé d'une couleur source), `theme/Theme.kt` (`CadenceTheme(appearance)` alimente la palette Cadence et le `colorScheme` Material 3, que `tasks/` lit) et `components/` (surfaces, contrôles, en-têtes, onglets, lignes, badges, cases, navigation, modal). Aucune valeur d'espacement ou de couleur littérale dans un écran.
- Trois niveaux de surface au maximum : fond calme, surface fonctionnelle, élément interactif accentué. La séparation vient du contraste de surface; seuls les éléments en verre (boutons d'en-tête, pastilles, barre de navigation) portent un liseré `outline` à 35 %.
- La signature visuelle est l'opposition extérieur doux / intérieur structuré : les surfaces sont largement arrondies, la progression d'une habitude est tracée sur une facette hexagonale (`designsystem/.../components/Facet.kt`), réservée aux habitudes.
- La navigation est une capsule translucide flottante (flou Haze sous Android 12+, teinte seule avant) à cinq cibles égales : Boîte, Tâches (ouverte au lancement), Agenda, Habitudes, Bilan. Chaque cible montre son icône et son libellé; l'active porte une pastille `primaryContainer`. Réglages est un écran poussé, ouvert par le bouton engrenage des en-têtes.
- Une rubrique de Réglages s'ajoute par une seule entrée de `settings/SettingsRegistry.kt` (`settingsPages`) : ligne, sous-titre et contenu de sa sous-page.
- Le thème suit le réglage système clair/sombre.
- L’abstinence est un plafond quotidien à zéro, avec un profil choisi explicitement (`AbstinenceProfile`) et une date de début de suivi. Hors alcool, les jours terminés sans occurrence enregistrée sont dérivés par `AbstinenceStatsCalculator`; une pause interrompt la continuité et reste exclue des statistiques. La journée en cours reste distincte.
- Le profil `ALCOHOL` conserve une consommation unique par date civile, avec un nombre entier facultatif de verres standards. `AlcoholStatsCalculator` dérive les jours terminés sans consommation notée, les séries, la fréquence sur 90 jours et l’objectif personnel d’un jour sans alcool par verre. Tant qu’un objectif court encore, une nouvelle quantité connue ajoute ses jours à l’échéance existante; une correction recalcule toute la dette. Aucun calcul n’est présenté comme une alcoolémie ou une aptitude à conduire.
- Une consommation alcool notée le jour même peut déclencher le lendemain une alarme locale inexacte, à l’heure choisie. Une quantité déjà renseignée, une suppression, une restauration ou une saisie rétroactive ne déclenche pas cette relance; la demande reste visible dans l’application sans permission de notification.
- Les jalons d’abstinence sont uniquement des observations scientifiques associées à une durée et à une source. Les textes et références sont embarqués (`AbstinenceGuide`, ressources `abstinence-*.xml`), les liens ouvrent le navigateur externe. La chronologie alcool couvre chaque période avec un constat concret et sa portée exacte, y compris la sécurité du sevrage quand un bénéfice général ne peut pas être affirmé; aucun taux hormonal ni état d’organe n’est déduit du compteur.
- L'abstinence dispose d'une création et d'un détail dédiés. Le profil reste fixe après création; la date et l'heure de départ restent modifiables. Une dépense réelle facultative porte un montant en unités mineures, une cadence quotidienne, hebdomadaire ou mensuelle, et une devise choisie; le total économisé est dérivé du compteur actif, avec la durée réelle des mois. Hors alcool, le détail montre le compteur, une action directe pour enregistrer un écart et les jalons scientifiques. Le détail alcool montre les consommations datées, les quantités manquantes, l’objectif personnel et la chronologie des preuves; aucun profil ne contient de journal, de note quotidienne ni de suivi des envies.
- Les statistiques de chaque habitude (`HabitStatisticsSummary`) comptent les périodes closes dans les 30 derniers jours terminés, avec leurs versions historiques. Les pauses complètes et périodes sans planning sont neutres. Une comparaison de taux n’apparaît que pour un rythme homogène et deux échantillons suffisants; `StatisticsConfidence` qualifie séparément le recul disponible. Le calendrier hebdomadaire/mensuel montre l’activité, jamais une exigence quotidienne fictive.
- Les statistiques distinguent réussite d’objectif et activité enregistrée : `HabitActivityStats` compte les saisies, jours actifs et quantités des 30 derniers jours, même pendant une pause. Les moyennes alcool utilisent seulement les journées aux verres renseignés; les intervalles entre écarts ignorent ceux traversant une pause.
- Une activité libre utilise `GoalDirection.TRACK_ONLY` avec une cible nulle et une mesure `COUNT`, `QUANTITY` ou `DURATION`. Elle reste saisissable chaque jour sans réussite, échec, série, planning contraignant ni jauge de progression; sa direction textuelle traverse Room et la sauvegarde sans nouvelle colonne. Ses KPI portent sur 30 jours, avec contexte sur 90 jours, et tout l’historique est consultable dans Statistiques.
- La zone `À compléter` regroupe uniquement une donnée réellement ouverte : quantité d’alcool inconnue ou chronomètre non terminé. Elle n’invente ni brouillon, ni relance pour une saisie déjà complète.
- Le mode `dev.ps1 -Dummy` peuple uniquement le build debug avec six habitudes ordinaires et 60 jours d’historique déterministe; une relance remplace seulement les données préfixées `dummy-`.
- Questions apprises (`QuestionPlanner`, `LearnedQuestionRepository`) : on demande le lendemain seulement si ce jour de la semaine a une saisie dans au moins le seuil (50 % par défaut) des 12 dernières semaines, sur 4 semaines observées au minimum (les pauses sont neutres), sans saisie, pause, réponse ni jour rendu muet; actives d'office pour les activités libres et les abstinences. Un « Non » n'écrit aucune saisie, l'alcool n'ayant pas de jour à zéro : seule la réponse est gardée; un « Oui » rétroactif ne déclenche aucune relance et ne remplace jamais une saisie faite entre-temps.
- Health Connect est une source locale facultative pour les habitudes de durée : Cadence lit au premier plan les séances des 30 derniers jours selon une règle types + application source, importe chaque identifiant une seule fois et n’exporte aucune donnée santé. Corriger une séance la détache de la source; la supprimer l’ignore durablement; suspendre une règle ou la synchronisation conserve l’historique.
- Agendas de l'appareil : `:calendar` lit `CalendarContract` en lecture seule (permission `READ_CALENDAR`), jamais d'écriture dans le fournisseur. L'état « fait » d'une occurrence est local à Cadence (DataStore, clé agenda + événement + début d'occurrence) ; une journée entière, ancrée à minuit UTC par le fournisseur, est replacée sur son jour civil local.

- Notes : l'entité serveur `note` est synchronisée dans les deux sens (table Room `notes`, base v4 ; titre, contenu, couleur, épingle `pin_to_sidebar`, projet, étiquettes). Écritures par `TaskRepository.saveNote` via la file d'envoi, comme les tâches ; une note jamais saisie n'est pas créée. La saisie est sauvegardée en différé (`notes/NoteAutosave`) et fusionnée avec l'écho de la base sans effacer ce qui a été tapé depuis. Les migrations 2→3 et 3→4 effacent le curseur pour ramener un instantané complet. Une suppression de note ou d'idée est annulable : l'élément est masqué 4,5 s, l'envoi du `delete` n'a lieu qu'ensuite (le serveur refuse de recréer un uid supprimé). Liens et commentaires de tâche ne sont pas dans le registre de synchro : lignes d'attente, à lire sur le web.
- Aperçus de liens : `GET /api/url/title` (serveur, garde SSRF) avec la clé API, jamais d'appel direct de l'appareil à un site. Cache Room `link_previews` (7 jours, échec 1 h, contenu périmé gardé hors ligne, `links/PreviewCachePolicy`) ; l'image rapportée par le serveur est chargée par Coil (cache disque). Pas de favicon : une pastille à l'initiale du domaine sert de repli sans requête.
- Les champs de tâche absents des colonnes Room (début, estimation, règle de répétition) vivent dans `extrasJson` ; `TaskFields` (data) les écrit comme champs synchronisés ordinaires et `TaskItem.extras` les relit. Une règle de répétition hors none/daily/weekly/monthly reste affichée sans pouvoir être écrasée par accident.
- La recherche (`tasks/search/SearchEngine`) est locale, sans accents ni casse, tous les mots doivent correspondre ; les habitudes y entrent par `SearchEntry` fournies par `:app`.
- Le minuteur de concentration (`tasks/focus/PomodoroState`) est local et dérivé de l'horloge, comme `HabitTimer` : on ne stocke que l'instant de reprise et le reste figé.

## ⛔ Interdits
- ⛔ Limiter Cadence aux habitudes à objectif et aux abstinences — une activité doit pouvoir être notée sans cible; la traiter comme une habitude en retard inventerait une obligation.
- ⛔ Présenter une donnée à compléter comme un simple texte — l’action doit avoir une surface, un verbe et un indicateur visuel clairement touchables.
- ⛔ Publier sur NicoApps sans transmettre puis relire le bloc courant de `CHANGELOG.md` — l’APK ne contient pas les notes de version et le catalogue ne peut pas les reconstruire.
- ⛔ Afficher un jalon alcool vide comme « Pas de bénéfice daté établi » — chaque période donne une observation concrète, sa population et sa source sans transformer une donnée limitée en promesse générale.
- ⛔ Remplacer le temps écoulé vivant d’une abstinence par les seuls jours complets — le suivi alcool affiche les deux, car ils répondent à deux besoins différents.
- ⛔ Réduire le compteur détaillé d’abstinence à une ligne — les quatre barres jours, heures, minutes et secondes restent visibles dans le détail.
- ⛔ Présenter d’abord des jours dans les statistiques d’un objectif hebdomadaire ou mensuel — l’aperçu suit la période souhaitée, le détail quotidien reste secondaire.
- ⛔ Poursuivre les captures d’écran après une demande d’arrêt — terminer les vérifications automatisées et la publication demandée.
- ⛔ Utiliser un sous-agent coûteux pour un travail borné ou écraser le travail parallèle — privilégier Terra ou AGY et coordonner les fichiers partagés.
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
- ⛔ Ajouter un journal, une note quotidienne ou un suivi des envies à une abstinence — son détail reste centré sur le compteur, l’écart et les bienfaits documentés.
- ⛔ Créer des jalons personnels pour remplir une chronologie — seuls les bénéfices liés à une durée et suffisamment sourcés sont déblocables; sinon l’absence de preuve est affichée.
- ⛔ Utiliser la couleur propre d’une habitude pour coder sa réussite — elle sert uniquement à l’identifier; réussite, progression, échec et neutralité gardent les mêmes couleurs sémantiques partout.
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
Rappels conditionnels, sauvegarde JSON, statistiques historiques et abstinences avec profils et jalons scientifiques sourcés disponibles.
