# Parité Cadence

Toutes les fonctionnalités de Cadence sont reprises, pas son design. Chemins relatifs à `Cadence/`. Cocher une colonne quand la fonctionnalité y est livrée et testée ; rien n'est terminé tant qu'une case attendue reste vide. `—` : sans objet sur cette cible.

Linux/web n'a pas de widget : son équivalent est l'icône de la barre système, l'ajout rapide global et les notifications natives.

| Fonctionnalité | Source Cadence | Serveur | Android | Linux/web |
|---|---|---|---|---|
| **Habitudes & objectifs** | | | | |
| Éditeur en étapes (identité, objectif, planning, saisie rapide, rappels) | `app/.../HabitEditor.kt` | — | [ ] | [ ] |
| Types binaire, compteur, quantité, durée, unité personnalisée | `domain/.../HabitModels.kt` | [ ] | [ ] | [ ] |
| Périodes jour / semaine / mois, premier jour de semaine | `PeriodCalculator.kt` | [ ] | [ ] | [ ] |
| Planning : tous les jours, jours choisis, n'importe quel jour, tous les N jours | `HabitEvaluator.kt` | [ ] | [ ] | [ ] |
| Minimum et idéal, fréquence indépendante de la quantité | `GoalProgression.kt` | [ ] | [ ] | [ ] |
| Sens Atteindre / Limiter (`AT_MOST`, statuts de limite) | `HabitModels.kt` | [ ] | [ ] | [ ] |
| Progression automatique de cible (semaine/mois, plafond, aperçu, arrêt) | `GoalProgression.kt` | [ ] | [ ] | [ ] |
| Activité libre (`TRACK_ONLY`) | `HabitActivityStats.kt` | [ ] | [ ] | [ ] |
| Objectifs et plannings versionnés (le passé n'est pas réinterprété) | `AGENTS.md` | [ ] | [ ] | [ ] |
| Archiver, restaurer, dupliquer, réordonner, supprimer | `MainViewModel.kt` | [ ] | [ ] | [ ] |
| Icône et couleur par habitude | `ui/icon/HabitIconRegistry.kt` | [ ] | [ ] | [ ] |
| **Saisie & entrées** | | | | |
| Saisie rapide : +N configurables, valeur libre, note, annuler la dernière | `QuickEntryActivity.kt` | [ ] | [ ] | [ ] |
| Action directe (appui long) : valider, ajouter, sauter | `MainViewModel.kt` | — | [ ] | [ ] |
| Saisie passée, correction, suppression (date et fuseau observés gardés) | `HabitEntryCorrection.kt` | [ ] | [ ] | [ ] |
| Zone « À compléter » (verres inconnus, chrono non terminé) | `ToCompleteSection.kt` | [ ] | [ ] | [ ] |
| Aujourd'hui : à faire, terminées repliées, filtre groupe, état vide | `TodayPresentation.kt` | [ ] | [ ] | [ ] |
| Cette semaine : À faire, Bien parti, Minimum atteint, Terminé ; masque sans action | `WeekOutlook.kt` | [ ] | [ ] | [ ] |
| **Chronomètres** | | | | |
| Démarrer, pause, reprendre, terminer, réinitialiser ; palier en direct | `HabitTimer.kt` | [ ] | [ ] | [ ] |
| Segments + instant de reprise, jamais la durée ; survit au redémarrage | `HabitTimer.kt` | [ ] | [ ] | [ ] |
| Notification persistante du chrono | `reminder/TimerNotifications.kt` | — | [ ] | [ ] |
| **Pauses** | | | | |
| Saut d'un jour avec motif, annulable le jour même | `PauseSheets.kt` | [ ] | [ ] | [ ] |
| Voyage : plage incluse, toutes / un groupe, reprise anticipée | `PauseSheets.kt` | [ ] | [ ] | [ ] |
| Pause neutre pour séries et stats, sans rappel | `HabitEvaluator.kt` | [ ] | [ ] | [ ] |
| **Groupes** | | | | |
| Groupes horaires (passage de minuit, chevauchement) ; Journée non supprimable | `HabitGroup.kt` | [ ] | [ ] | [ ] |
| Filtre par groupe, déplacement d'habitude, réordonnancement | `MainViewModel.kt` | [ ] | [ ] | [ ] |
| **Séries & statistiques** | | | | |
| Série = périodes planifiées réussies, périodes neutres traversées | `StreakCalculator.kt` | [ ] | [ ] | [ ] |
| Bilan 30 jours avec niveau de confiance | `HabitStatisticsSummary.kt` | [ ] | [ ] | [ ] |
| Activité 30 jours, contexte 90 jours | `HabitActivityStats.kt` | [ ] | [ ] | [ ] |
| Calendrier d'activité et calendrier 12 semaines | `HabitHeatmap.kt` | — | [ ] | [ ] |
| Historique des six dernières périodes | `HabitHistoryGraph.kt` | [ ] | [ ] | [ ] |
| Analyses : meilleur jour, meilleur créneau, mois vs précédent | `HabitInsights.kt` | [ ] | [ ] | [ ] |
| Écran Statistiques : synthèse puis détail | `StatisticsPulse.kt` | — | [ ] | [ ] |
| **Abstinence** | | | | |
| Profils fixes (tabac, caféine, écrans…) et personnalisé | `AbstinenceStats.kt` | [ ] | [ ] | [ ] |
| Temps écoulé, départ modifiable | `AbstinenceElapsed.kt` | [ ] | [ ] | [ ] |
| Écart avec note, jours sans écart dérivés | `AbstinenceStats.kt` | [ ] | [ ] | [ ] |
| Journal : contrôles quotidiens et envies | `AbstinenceJournal.kt` | [ ] | [ ] | [ ] |
| Économies (dépense par période, monnaie, durées réelles des mois) | `AbstinenceSavings.kt` | [ ] | [ ] | [ ] |
| Jalons sourcés et notifications de jalon | `AbstinenceGuide.kt` | [ ] | [ ] | [ ] |
| Panneau d'abstinences sur l'accueil | `AbstinencePanel.kt` | — | [ ] | [ ] |
| **Alcool** | | | | |
| Une consommation par date civile, verres standards facultatifs | `AlcoholStats.kt` | [ ] | [ ] | [ ] |
| Jours sans, séries, fréquence 90 j, moyenne, intervalles, objectif par verre | `AlcoholStats.kt` | [ ] | [ ] | [ ] |
| Relance du lendemain matin pour préciser les verres | `reminder/AlcoholFollowUpNotifications.kt` | — | [ ] | [ ] |
| Chronologie des preuves par période | `AbstinenceGuide.kt` | — | [ ] | [ ] |
| **Widget** (Android ; équivalent barre système sur Linux) | | | | |
| Une icône par habitude en attente, valeur, progression | `widget/CadenceWidget.kt` | — | [ ] | [ ] |
| Contenu : non terminées hors pause, abstinences, chronos en cours | `CadenceWidget.kt` | — | [ ] | [ ] |
| Toucher icône = saisie rapide ; fond = ouvrir l'app | `CadenceWidget.kt` | — | [ ] | [ ] |
| Configuration complète (sélection, styles, opacité, tailles, anneau/barre, par ligne, emplacements) | `WidgetConfigurationActivity.kt` | — | [ ] | — |
| Filtre de groupe : tous, selon l'heure, choisi ; repli si groupe disparu | `WidgetGroupSelection.kt` | — | [ ] | [ ] |
| Rafraîchissement à l'écriture (fenêtre 60 ms) | `widget/WidgetAutoRefresh.kt` | — | [ ] | [ ] |
| Rafraîchissement aux bornes : minuit, groupes, toutes les heures si abstinence | `WidgetRefreshSchedule.kt` | — | [ ] | [ ] |
| Redessin au changement de date, d'heure, de fuseau, au démarrage | `CadenceWidgetReceiver` | — | [ ] | [ ] |
| Reconfiguration après pose, aperçu | `WidgetConfigurationActivity.kt` | — | [ ] | — |
| **Rappels** | | | | |
| Rappels à heure fixe seulement si l'objectif reste à faire ; alarmes inexactes | `reminder/ReminderScheduler.kt` | [ ] | [ ] | [ ] |
| Actions : Valider, +valeur, Sauter, Reporter 30 min | `ReminderScheduler.kt` | — | [ ] | [ ] |
| Restauration après redémarrage, changement d'heure ou de fuseau | `ReminderBootReceiver` | — | [ ] | [ ] |
| Canaux : rappels, abstinences, relances alcool, chrono | `reminder/*.kt` | — | [ ] | [ ] |
| Annulé pendant une pause ou dès l'objectif atteint | `ReminderScheduler.kt` | [ ] | [ ] | [ ] |
| **Health Connect** (Android) | | | | |
| Import des séances d'exercice 30 j selon règle types + app source | `health/HealthConnectGateway.kt` | — | [ ] | — |
| Import unique, correction détache, suppression ignorée, règle suspendue | `HealthConnectImport.kt` | [ ] | [ ] | — |
| Sync à l'ouverture, à l'octroi, à l'activation ; écran de justification | `MainViewModel.kt` | — | [ ] | — |
| **Données** | | | | |
| Export / import JSON versionné (formats 1-3 migrés) | `data/.../BackupDocument.kt` | [ ] | [ ] | [ ] |
| Import Cadence → Tududi avec séries et stats identiques | — | [ ] | [ ] | — |
| Données de démonstration (debug) | `debug/DummyDataSeeder.kt` | [ ] | [ ] | [ ] |
| Fonctionne hors ligne, tâches comprises, sans doublon au retour réseau | — | [ ] | [ ] | [ ] |
