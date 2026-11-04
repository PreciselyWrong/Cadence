package ch.nicolab.cadence.tasks.quickadd

import ch.nicolab.cadence.tasks.ui.CaptureTarget
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class QuickAddTargetTest {
    @Test
    fun `le raccourci Inbox capture dans l'Inbox, tout autre lancement cree une tache`() {
        assertEquals(QuickAddTarget.INBOX, QuickAddTarget.fromAction(QuickAddTarget.ACTION_CAPTURE_INBOX))
        assertEquals(QuickAddTarget.TASK, QuickAddTarget.fromAction(null))
        assertEquals(QuickAddTarget.TASK, QuickAddTarget.fromAction("android.intent.action.VIEW"))
    }

    @Test
    fun `la saisie du widget propose la tache puis l'Inbox, l'ordre suivant le raccourci`() {
        assertEquals(listOf(CaptureTarget.TASK, CaptureTarget.INBOX), QuickAddTarget.TASK.captureTargets)
        assertEquals(listOf(CaptureTarget.INBOX, CaptureTarget.TASK), QuickAddTarget.INBOX.captureTargets)
    }
}
