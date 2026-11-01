package ch.nicolab.cadence.tasks.quickadd

/** Ce que crée une saisie rapide : une tâche, ou une idée directe dans l'Inbox (raccourci de l'icône). */
enum class QuickAddTarget {
    TASK,
    INBOX,
    ;

    companion object {
        const val ACTION_CAPTURE_INBOX = "ch.nicolab.cadence.action.CAPTURE_INBOX"

        fun fromAction(action: String?): QuickAddTarget = if (action == ACTION_CAPTURE_INBOX) INBOX else TASK
    }
}
