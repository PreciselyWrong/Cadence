# Audit QoL du web (2026-11-19)

Audit des petits gestes qui manquent sur le web. Android viendra ensuite : chaque ligne livrée ici a son pendant dans `TODO.md` (`Now`).

Référence : Things 3, TickTick, Todoist (clic droit partout, mêmes actions partout, annulation au lieu de confirmation, clavier complet).

## Constat

| # | Problème | Où | Gravité |
|---|---|---|---|
| 1 | Trois menus clic droit différents pour une même tâche, aucun complet | listes (`MinimalContextMenu`), Aujourd'hui (`TodayView.lineMenu`), Planifier (`UpcomingBoard.cardMenuEntries`) | haute |
| 2 | « Supprimer » absent du clic droit sur Aujourd'hui et Planifier ; dans les listes, enterré sous la liste de tous les projets | idem | haute |
| 3 | Clic droit des listes seulement en densité minimale ; en densité dense, menu du navigateur | `TaskRow/index.tsx` | haute |
| 4 | Pas de clic droit sur les cartes des jours de Planifier (seulement En retard et horizons), ni sur le tableau de projet, la file « Tâches à classer », les résultats de recherche | `UpcomingBoard.tsx`, `ProjectBoard.tsx`, `UnsortedTasks.tsx` | haute |
| 5 | Menu sans « Terminer », « Ouvrir », « Copier le lien », « Copier le titre », « Choisir une date… » | `MinimalContextMenu.tsx` | moyenne |
| 6 | Aucune sélection multiple dans les listes de tâches (seulement Planifier) : pas de terminer, dater, déplacer ou supprimer par lot | `TaskList.tsx`, `GroupedTaskList.tsx` | haute |
| 7 | La ligne « Ajouter une tâche » des listes ne lit rien (`demain !1 #projet`), alors que Planifier et la capture le font | `Task/NewTask.tsx` | moyenne |
| 8 | Fiche de tâche : pas de tâche suivante / précédente au clavier | `Task/TaskPane.tsx` | moyenne |
| 9 | Pas de clic droit sur les projets, zones, étiquettes de la barre latérale ni sur la liste des notes | `Sidebar/`, `Notes.tsx` | moyenne |
| 10 | Sous-tâche supprimée depuis la ligne parente sans annulation | `TaskRow/index.tsx` | basse |
| 11 | Projets, zones, étiquettes : suppression par boîte de confirmation, sans annulation | `Projects.tsx`, `Areas.tsx`, `Tags.tsx` | basse (cascade, la confirmation reste) |
| 12 | Deux modules d'annulation de suppression (`deferredDelete.ts`, `taskDeleteUndo.ts`) | `utils/` | basse (dette) |

Déjà bien : palette `Ctrl+K`, aide `?`, `g t/u/c/p`, touches des lignes minimales (`x`, `e`, `d`, `p`, `m`, `Suppr`), annulation des suppressions et des déplacements, sélection multiple de Planifier.

## Livré dans ce lot

- Un seul menu de tâche (`frontend/components/Task/menu/`) partout où une tâche s'affiche, dans les deux densités, avec sous-menus : Ouvrir, Terminer / Rouvrir, Date ▸ (Aujourd'hui, Demain, Semaine prochaine, Choisir…, Sans date), Priorité ▸, Projet ▸, Épingler, Dupliquer, Copier le lien, Copier le titre, Supprimer (avec annulation). Chaque page ajoute ses actions propres en tête (Aujourd'hui : caser, retirer l'heure, retirer du jour ; Planifier : horizons).
- Sélection multiple dans les listes : `Ctrl`/`Cmd`+clic, `Maj`+clic pour une plage, `Échap` pour vider ; barre d'actions : Terminer, Date, Priorité, Projet, Supprimer (une seule annulation).
- « Ajouter une tâche » lit la date, la priorité et le projet comme Planifier.
- Fiche de tâche : `j` / `k` ouvrent la tâche suivante / précédente de la page.
- Clic droit sur la liste des notes (Ouvrir, Épingler, Supprimer avec annulation) et sur les projets de la barre latérale (Ouvrir, Désépingler, Modifier, Supprimer avec confirmation) ; zones et étiquettes : Ouvrir seulement.

## Laissé pour plus tard

- 10, 11, 12 : faible gain, à reprendre quand on touche ces fichiers.
- Supprimer et Modifier sur les zones et étiquettes de la barre latérale : leurs dialogues vivent dans `Areas.tsx` et `Tags.tsx`, à extraire en crochet d'abord.
- Projets rangés dans un dossier de zone (barre latérale minimale) : pas encore de menu.
