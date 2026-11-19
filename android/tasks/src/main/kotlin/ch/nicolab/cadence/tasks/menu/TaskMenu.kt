package ch.nicolab.cadence.tasks.menu

import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.project.canBecomeProject

/**
 * Actions du menu unique d'une tâche (appui long sur n'importe quel écran), dans le même ordre que le web
 * (`frontend/components/Task/menu/taskMenuEntries.ts`) : gestes propres à l'écran d'abord, puis Ouvrir, Terminer,
 * Date, Priorité, Projet, Épingler, extras de revue, Dupliquer, Transformer en projet, Copier le lien, Copier le titre,
 * et Supprimer.
 */
enum class TaskMenuAction {
    MOVE_UP,
    MOVE_DOWN,
    OPEN,
    TOGGLE,
    DATE,
    PRIORITY,
    PROJECT,
    PIN,
    FUNNEL_IN_VIEW,
    FUNNEL_THIS_WEEK,
    FUNNEL_LATER,
    NEXT_ACTION,
    DUPLICATE,
    TURN_INTO_PROJECT,
    COPY_LINK,
    COPY_TITLE,
    DELETE,
}

data class TaskMenuInput(
    val task: TaskItem,
    val canMoveUp: Boolean = false,
    val canMoveDown: Boolean = false,
    val nextAction: Boolean? = null,
    val includeFunnel: Boolean = true,
)

data class TaskMenuEntry(
    val action: TaskMenuAction,
    val active: Boolean = false,
    val danger: Boolean = false,
)

object TaskMenu {
    fun entries(input: TaskMenuInput): List<TaskMenuEntry> {
        val task = input.task
        val fileBacked = task.fileBacked
        val list = ArrayList<TaskMenuEntry>(16)

        if (input.canMoveUp) list += TaskMenuEntry(TaskMenuAction.MOVE_UP)
        if (input.canMoveDown) list += TaskMenuEntry(TaskMenuAction.MOVE_DOWN)

        list += TaskMenuEntry(TaskMenuAction.OPEN)
        list += TaskMenuEntry(TaskMenuAction.TOGGLE, active = task.isClosed)
        list += TaskMenuEntry(TaskMenuAction.DATE)
        list += TaskMenuEntry(TaskMenuAction.PRIORITY)
        if (!fileBacked) {
            list += TaskMenuEntry(TaskMenuAction.PROJECT)
        }
        list += TaskMenuEntry(TaskMenuAction.PIN, active = task.pinnedAt != null)

        if (input.includeFunnel && !task.isRecurring && task.parentTaskUid == null) {
            list += TaskMenuEntry(TaskMenuAction.FUNNEL_IN_VIEW)
            list += TaskMenuEntry(TaskMenuAction.FUNNEL_THIS_WEEK)
            list += TaskMenuEntry(TaskMenuAction.FUNNEL_LATER)
        }
        input.nextAction?.let { designated ->
            list += TaskMenuEntry(TaskMenuAction.NEXT_ACTION, active = designated)
        }

        if (!fileBacked) {
            list += TaskMenuEntry(TaskMenuAction.DUPLICATE)
        }
        if (canBecomeProject(task)) {
            list += TaskMenuEntry(TaskMenuAction.TURN_INTO_PROJECT)
        }
        list += TaskMenuEntry(TaskMenuAction.COPY_LINK)
        list += TaskMenuEntry(TaskMenuAction.COPY_TITLE)
        if (!fileBacked) {
            list += TaskMenuEntry(TaskMenuAction.DELETE, danger = true)
        }
        return list
    }

    /** Adresse web d'une tâche, ou chemin relatif hors ligne. */
    fun taskUrl(baseUrl: String?, uid: String): String {
        val trimmed = baseUrl?.trim()?.trimEnd('/')
        return if (trimmed.isNullOrEmpty()) "/task/$uid" else "$trimmed/task/$uid"
    }
}
