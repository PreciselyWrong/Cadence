package ch.nicolab.cadence.tasks.quickadd

import ch.nicolab.cadence.tasks.ui.CaptureTarget

/** Ce que crée une saisie rapide : une tâche, ou une idée directe dans l'Inbox (raccourci de l'icône). */
enum class QuickAddTarget {
    TASK,
    INBOX,
    ;

    /** Destinations de la saisie ouverte hors de l'app, celle du raccourci d'abord. */
    val captureTargets: List<CaptureTarget>
        get() = when (this) {
            TASK -> listOf(CaptureTarget.TASK, CaptureTarget.INBOX)
            INBOX -> listOf(CaptureTarget.INBOX, CaptureTarget.TASK)
        }

    companion object {
        const val ACTION_CAPTURE_INBOX = "ch.nicolab.cadence.action.CAPTURE_INBOX"

        fun fromAction(action: String?): QuickAddTarget = if (action == ACTION_CAPTURE_INBOX) INBOX else TASK
    }
}
