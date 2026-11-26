package ch.nicolab.cadence.tasks.quickadd

import ch.nicolab.cadence.tasks.ui.CaptureTarget
import java.time.LocalDate

/**
 * Une tâche capturée sans date reste visible dans « À classer / Captures » (`needsWhen = true`)
 * même si elle porte déjà un `+projet` ou un `~domaine`, afin qu'elle ne disparaisse pas dans les limbes.
 */
fun quickAddNeedsWhen(
    dueDate: LocalDate?,
    projectUid: String?,
    areaUid: String?,
    fromLink: Boolean,
): Boolean = dueDate == null && (projectUid != null || areaUid != null || fromLink)

/** Libellé court confirmant où une capture rapide a atterri. */
fun quickAddDestinationLabel(
    isInbox: Boolean,
    projectName: String?,
    hasDate: Boolean,
): String = when {
    isInbox -> "Capturée dans Boîte de réception"
    projectName != null && !hasDate -> "Ajoutée dans $projectName · À classer"
    projectName != null -> "Ajoutée dans $projectName"
    !hasDate -> "Ajoutée dans À classer"
    else -> "Tâche ajoutée"
}

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
