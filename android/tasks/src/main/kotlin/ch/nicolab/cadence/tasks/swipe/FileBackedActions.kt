package ch.nicolab.cadence.tasks.swipe

import ch.nicolab.cadence.tasks.model.TaskItem

/**
 * Une tâche reflétant un fichier TODO.md n'accepte que la case : le serveur refuse tout autre
 * changement, et le fichier reste la source de vérité.
 */
internal object FileBackedActions {
    /** Seuls terminer/rouvrir passent ; les autres gestes n'ont aucun effet sur une tâche de fichier. */
    fun allowsSwipe(task: TaskItem, action: SwipeAction): Boolean =
        !task.fileBacked || action == SwipeAction.COMPLETE || action == SwipeAction.NONE

    /** Réglage de balayage effectif : les actions interdites sont retirées, le reste est inchangé. */
    fun swipeConfig(task: TaskItem, config: SwipeConfig): SwipeConfig {
        if (!task.fileBacked) return config
        fun keep(action: SwipeAction) = if (allowsSwipe(task, action)) action else SwipeAction.NONE
        return SwipeConfig(keep(config.rightShort), keep(config.rightLong), keep(config.leftShort), keep(config.leftLong))
    }

    /** Titre, champs, sélecteurs, sous-tâches, suppression et planification sont désactivés. */
    fun canEdit(task: TaskItem): Boolean = !task.fileBacked
}
