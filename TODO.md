# Cadence

## Now
- [ ] Chronomètre pour les habitudes de durée
  - Proposer un mode chronomètre activable pour les objectifs en durée, sans le rendre obligatoire
  - La saisie rapide affiche `Démarrer`, `Pause`, `Reprendre`, `Terminer` et `Réinitialiser`
  - Le temps écoulé continue après le minimum et passe visuellement à `Minimum atteint`, puis `Idéal atteint`
  - Enregistrer une seule saisie de durée à la fin; une pause ne crée pas de temps compté
  - Préserver un chronomètre en cours après rotation, retour à l’application et redémarrage du processus
  - Le widget et les notifications indiquent qu’un chronomètre est actif et permettent de le reprendre rapidement
  - Vérification : passage minimum/idéal, pause longue, minuit, changement de fuseau, annulation, réinitialisation et double appui

## Fonctions à venir
- [ ] Groupes dans l’application
  - Filtrer Aujourd’hui et Habitudes par groupe sans cacher l’accès à l’ensemble
  - Créer, renommer, réordonner et supprimer un groupe; déplacer simplement ses habitudes
  - Vérification : suppression avec habitudes, groupe vide, archive, duplication et sauvegarde

## Next
- [ ] Habitudes à limiter
  - Définir un maximum par période, par exemple deux cafés par jour
  - Rester sous la limite est positif; atteindre puis dépasser la limite devient progressivement visible
  - Vérification : aucune saisie négative, changement de limite sans réinterpréter l’historique
- [ ] Objectifs progressifs
  - Augmentation automatique configurable par semaine ou par mois, avec plafond facultatif
  - Prévisualiser les prochaines cibles et permettre d’arrêter la progression
  - Vérification : fuseaux, changements de mois, plafonds et objectifs versionnés
- [ ] Notes rapides sur les saisies
  - Ajouter ou modifier une note courte depuis la saisie rapide et l’historique
  - Vérification : plusieurs saisies le même jour, sauvegarde et restauration
- [ ] Vue Cette semaine
  - Regrouper les habitudes en `À faire`, `Bien parti`, `Minimum atteint` et `Terminé`
  - Montrer uniquement les actions utiles et ouvrir directement la saisie concernée
  - Vérification : rythmes flexibles, jours choisis, tous les N jours et habitudes à limiter
- [ ] Séries intelligentes
  - Compter les périodes planifiées réussies, pas les jours calendaires consécutifs
  - Ignorer pauses, voyages et sauts autorisés sans créer de réussite artificielle
  - Vérification : tous les N jours, semaines flexibles, changements d’objectif et historique


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
    - **Type d'exercice** (`ExerciseSessionRecord.exerciseType`) : `RUNNING`, `CYCLING`, `SWIMMING`, `WEIGHTLIFTING`, `OTHER_WORKOUT`… — liste fixe définie par Health Connect, indépendante de l'app source
    - **Application source** (`metadata.dataOrigin.packageName`) : filtrer par app précise, par exemple Strava uniquement, ou toutes les sources acceptées
  - Exemples : `RUNNING || CYCLING` → Cardio ; `WEIGHTLIFTING` depuis `com.myfitnesspal` → Musculation
  - Importer la durée de la séance pour compléter automatiquement l'objectif, minimum et idéal inclus
  - Continuer d'accepter simultanément le chronomètre Cadence et les saisies manuelles, sans compter deux fois la même séance
  - Montrer clairement l'origine de chaque durée : app source, chronomètre ou saisie manuelle
  - Permettre de modifier, ignorer ou désactiver les règles à tout moment sans effacer l'historique importé
  - Vérification : permission refusée, source déconnectée, import différé, doublons, correction manuelle, fuseaux et sauvegarde/restauration sans données de santé

## Done
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
