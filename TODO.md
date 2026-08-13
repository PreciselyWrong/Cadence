# Cadence

## Now
- [ ] Corriger une saisie et l’historique
  - Depuis Aujourd’hui et l’historique, ouvrir chaque saisie pour modifier sa valeur, sa date, son heure ou sa note, puis la supprimer si nécessaire
  - Une saisie rapide erronée, par exemple `+10`, reste corrigeable à tout moment en une action claire
  - Recalculer immédiatement progression, minimum/idéal, séries, statistiques et widget après correction
  - Conserver la date civile et le fuseau réellement choisis lors d’une correction passée
  - Vérification : plusieurs saisies le même jour, correction transfrontalière de période, suppression, annulation et sauvegarde/restauration

## Fonctions à venir
- [ ] Synchroniser les activités sportives via Health Connect
  - Connecter Cadence à Health Connect, avec consentement explicite et sans compte Cadence
  - Associer une habitude, par exemple `Cardio`, à un type d’activité suivi par la montre ou une application compatible
  - Importer la durée des séances compatibles pour compléter automatiquement l’objectif de durée, y compris le minimum et l’idéal
  - Continuer d’accepter simultanément le chronomètre Cadence et les saisies manuelles, sans compter deux fois la même séance
  - Montrer clairement l’origine de chaque durée : montre, chronomètre ou ajout manuel
  - Permettre de choisir les activités importées, de les ignorer, de les corriger ou de les désactiver à tout moment
  - Vérification : permission refusée, montre déconnectée, import différé, doublons, correction manuelle, fuseaux et sauvegarde/restauration sans données de santé

## Next
- [ ] Objectif minimum et idéal
  - Le minimum valide la période et la série; l’idéal marque une réussite complète
  - L’interface montre clairement `À faire`, `Minimum atteint` et `Idéal atteint`
  - Vérification : objectifs quotidiens, hebdomadaires, mensuels, fréquences et historique versionné
- [ ] Chronomètre pour les habitudes de durée
  - Proposer un mode chronomètre activable pour les objectifs en durée, sans le rendre obligatoire
  - La saisie rapide affiche `Démarrer`, `Pause`, `Reprendre`, `Terminer` et `Réinitialiser`
  - Le temps écoulé continue après le minimum et passe visuellement à `Minimum atteint`, puis `Idéal atteint`
  - Enregistrer une seule saisie de durée à la fin; une pause ne crée pas de temps compté
  - Préserver un chronomètre en cours après rotation, retour à l’application et redémarrage du processus
  - Le widget et les notifications indiquent qu’un chronomètre est actif et permettent de le reprendre rapidement
  - Vérification : passage minimum/idéal, pause longue, minuit, changement de fuseau, annulation, réinitialisation et double appui
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
- [ ] Saut motivé et réversible
  - `Sauter aujourd’hui` propose repos, maladie, voyage ou raison personnalisée
  - Le saut ne valide pas l’habitude, ne casse pas la série et peut être annulé le jour même
  - Vérification : widget, statistiques, historique, minuit et restauration
- [ ] Mode voyage
  - Suspendre plusieurs habitudes entre deux dates, avec sélection rapide par groupe
  - Afficher clairement la période et permettre une reprise anticipée
  - Vérification : plages inclusives, voyage en cours, futur, fuseau et rappels silencieux
- [ ] Vue Cette semaine
  - Regrouper les habitudes en `À faire`, `Bien parti`, `Minimum atteint` et `Terminé`
  - Montrer uniquement les actions utiles et ouvrir directement la saisie concernée
  - Vérification : rythmes flexibles, jours choisis, tous les N jours et habitudes à limiter
- [ ] Séries intelligentes
  - Compter les périodes planifiées réussies, pas les jours calendaires consécutifs
  - Ignorer pauses, voyages et sauts autorisés sans créer de réussite artificielle
  - Vérification : tous les N jours, semaines flexibles, changements d’objectif et historique
- [ ] Statistiques utiles
  - Afficher le meilleur jour et le meilleur créneau horaire avec un minimum de données fiable
  - Comparer le mois courant au précédent pour minimum, idéal, quantité et régularité
  - Éviter toute conclusion lorsque l’échantillon est insuffisant
  - Vérification : mois incomplet, habitudes récentes, pauses, limites et fuseaux
- [ ] Actions depuis les notifications
  - Proposer `Fait`, `+1` et `Sauter` selon le type d’objectif
  - Mettre à jour immédiatement l’application et le widget sans ouvrir d’écran inutile
  - Vérification : action répétée, habitude déjà terminée, permission refusée et redémarrage
- [ ] Groupes dans l’application
  - Filtrer Aujourd’hui et Habitudes par groupe sans cacher l’accès à l’ensemble
  - Créer, renommer, réordonner et supprimer un groupe; déplacer simplement ses habitudes
  - Vérification : suppression avec habitudes, groupe vide, archive, duplication et sauvegarde

## Ideas
- [ ] Variantes supplémentaires du widget
  - [ ] Définir le contrat des styles de rendu
  - [ ] Ajouter de nouveaux styles après validation du Halo
- [ ] Chronomètre de durée
- [ ] Valeurs rapides propres à chaque groupe ou moment de la journée

## Done
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
