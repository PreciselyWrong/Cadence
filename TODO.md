# Cadence

## Now
- [ ] Groupes d’habitudes et widget contextuel
  - Résultat : chaque habitude appartient à un groupe unique; `Journée` est disponible sans horaire
  - Groupes initiaux : `Journée`, `Matin`, `Après-midi`, `Soir`; noms et plages horaires modifiables
  - Une plage peut traverser minuit; les chevauchements sont autorisés et expliqués
  - Le widget propose `Tous les groupes` ou un groupe précis
  - En mode automatique, le widget affiche `Journée` et les groupes actifs à l’heure courante
  - Les habitudes terminées, sautées, en pause ou hors groupe actif disparaissent immédiatement
  - La configuration reste accessible depuis le lanceur et sauvegarde tous les réglages
  - Vérification : tests des bornes horaires, minuit, fuseau, changement d’heure et migration des habitudes existantes vers `Journée`

## Correctifs à venir
- [ ] Rafraîchissement immédiat du widget
  - Toute saisie, annulation, pause, saut ou modification d’habitude doit mettre à jour le widget placé sans attendre
  - La confirmation de l’action ne s’affiche qu’après la demande de rafraîchissement du widget
  - Vérification : saisie depuis l’application, saisie depuis le widget, annulation et plusieurs widgets placés
- [ ] Aperçu direct dans les paramètres du widget
  - Afficher un aperçu vivant qui reprend les réglages en cours avant l’enregistrement
  - L’aperçu reflète style, fond, textes, icônes, transparence, saturation, monochrome, taille et nombre d’habitudes
  - Vérification : chaque réglage se reflète immédiatement, sans modifier le widget placé avant l’enregistrement

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
