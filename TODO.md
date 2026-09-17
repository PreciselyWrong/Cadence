# Cadence

## Now
-

## Next
-

## Ideas
- [ ] Valeurs rapides propres à chaque groupe ou moment de la journée
- [ ] Synchronisation des habitudes avec le calendrier Android (`CalendarProvider`)
  - Écrire les événements à venir via `CalendarProvider` (API locale, permission `WRITE_CALENDAR`, aucune permission réseau) ; Google, Samsung ou tout agenda installé se charge de la synchronisation cloud de son côté
  - Choisir par habitude le créneau horaire et la durée à bloquer (repris depuis le groupe ou personnalisé)
  - Gérer le cycle de vie complet des événements : création, mise à jour après changement d'objectif, suppression à la validation de l'habitude, recréation si la saisie est annulée, suppression à la mise en pause ou au saut
  - Cadence conserve l'`_ID` CalendarProvider de chaque événement qu'elle a créé pour pouvoir le modifier ou le supprimer sans doublons
  - Choisir dans quel calendrier local écrire (agenda personnel, agenda dédié Cadence…)
  - Vérification : habitude sans horaire, permission refusée, événement supprimé manuellement dans l'agenda, changement de créneau, habitude supprimée et sauvegarde/restauration sans les IDs calendrier
- [ ] Synchroniser les activités sportives via Health Connect
  - Connecter Cadence à Health Connect, avec consentement explicite et sans compte Cadence
  - Associer chaque habitude à une règle de correspondance sur deux axes combinables :
    - **Type d'exercice** (`ExerciseSessionRecord.exerciseType`) : `RUNNING`, `CYCLING`, `SWIMMING`, `WEIGHTLIFTING`, `OTHER_WORKOUT`… - liste fixe définie par Health Connect, indépendante de l'app source
    - **Application source** (`metadata.dataOrigin.packageName`) : filtrer par app précise, par exemple Strava uniquement, ou toutes les sources acceptées
  - Exemples : `RUNNING || CYCLING` → Cardio ; `WEIGHTLIFTING` depuis `com.myfitnesspal` → Musculation
  - Importer la durée de la séance pour compléter automatiquement l'objectif, minimum et idéal inclus
  - Continuer d'accepter simultanément le chronomètre Cadence et les saisies manuelles, sans compter deux fois la même séance
  - Montrer clairement l'origine de chaque durée : app source, chronomètre ou saisie manuelle
  - Permettre de modifier, ignorer ou désactiver les règles à tout moment sans effacer l'historique importé
  - Vérification : permission refusée, source déconnectée, import différé, doublons, correction manuelle, fuseaux et sauvegarde/restauration sans données de santé

## Done
- [x] Modals de statistiques pleine hauteur, indicateurs colorés et sélecteurs de période
- [x] Activités sans objectif, KPI sur 30 et 90 jours et historique complet
- [x] Activité notée et moyennes détaillées dans les statistiques des habitudes et abstinences
- [x] Action claire pour renseigner les verres manquants
- [x] Compteur alcool vivant après une saisie et détail allégé
- [x] Publication NicoApps reliée au changelog avec relecture obligatoire
- [x] Six périodes alcool concrètes et sourcées des premières heures à plus d’un an
- [x] Barres du compteur alcool restaurées et jours de repos rendus cumulatifs
- [x] Compteur vivant restauré à côté des jours complets du suivi alcool
- [x] Comparaisons personnelles, recul explicite, actions à compléter et calendrier commun
- [x] Suivi alcool quotidien avec verres, relance et statistiques sur 90 jours
- [x] Aperçu statistique adapté au rythme et rafraîchissement du widget sans report continu
- [x] Accueil allégé, création guidée, saisie directe et rappels reportables
- [x] Abstinences sans journal, avec jalons scientifiques et statistiques aux couleurs explicites
- [x] Jeu de démonstration riche pour les habitudes et les statistiques
- [x] Rappels effacés à la réussite et nom de l’onglet actif restauré
- [x] Statistiques visuelles distinctes du détail
- [x] Actions concrètes et économies facultatives calculées depuis une dépense, sa fréquence et sa monnaie
- [x] Compteur d’abstinence vivant, saisie clarifiée, départ modifiable et paliers scientifiques
- [x] Cinq profils supplémentaires avec conseils et sauvegarde vérifiés
- [x] Bilan des habitudes sur 30 jours et parcours d’abstinence avec conseils et journal
- [x] Vue Cette semaine
- [x] Notes rapides sur les saisies
- [x] Objectifs progressifs
- [x] Habitudes à limiter
- [x] Groupes dans l’application
- [x] Séries intelligentes
- [x] Chronomètre pour les habitudes de durée
- [x] Variantes supplémentaires du widget
- [x] Mode voyage
- [x] Saut motivé et réversible
- [x] Actions depuis les notifications
- [x] Statistiques utiles
- [x] Objectif minimum et idéal
- [x] Corriger une saisie et l’historique
- [x] Groupes d’habitudes et widget contextuel
- [x] Synchronisation widget vers l’application
- [x] Affichage lisible des durées exactes
- [x] Rafraîchissement immédiat du widget
- [x] Aperçu direct dans les paramètres du widget
- [x] Enrichir le widget, les statistiques et l’action « Sauter aujourd’hui »
- [x] Personnaliser les textes et la répartition du widget
- [x] Ajouter les rythmes tous les N jours et enrichir les icônes
- [x] Régler jusqu’à six habitudes par ligne dans le widget
- [x] Rafraîchir le widget après une saisie et installer la publication sur le téléphone connecté
- [x] Rappels conditionnels
- [x] Historique et tendances utiles
- [x] Sauvegarde JSON versionnée
- [x] Widget Halo compact
- [x] Saisie rapide quotidienne
- [x] Persistance locale fiable
- [x] Moteur temporel fiable

## Dropped
-
