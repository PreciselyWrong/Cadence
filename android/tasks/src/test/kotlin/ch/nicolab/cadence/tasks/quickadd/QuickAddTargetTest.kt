package ch.nicolab.cadence.tasks.quickadd

import ch.nicolab.cadence.tasks.ui.CaptureTarget
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.LocalDate

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

    @Test
    fun `une tache capturee sans date avec un projet ou domaine reste dans A classer`() {
        assertTrue(quickAddNeedsWhen(dueDate = null, projectUid = "p1", areaUid = null, fromLink = false))
        assertTrue(quickAddNeedsWhen(dueDate = null, projectUid = null, areaUid = "a1", fromLink = false))
        assertTrue(quickAddNeedsWhen(dueDate = null, projectUid = null, areaUid = null, fromLink = true))
        assertFalse(quickAddNeedsWhen(dueDate = LocalDate.of(2026, 11, 26), projectUid = "p1", areaUid = null, fromLink = false))
        assertFalse(quickAddNeedsWhen(dueDate = null, projectUid = null, areaUid = null, fromLink = false))
    }

    @Test
    fun `le libelle de destination confirme ou la capture a atterri`() {
        assertEquals(
            "Capturée dans Boîte de réception",
            quickAddDestinationLabel(isInbox = true, projectName = null, hasDate = false),
        )
        assertEquals(
            "Ajoutée dans Cadence · À classer",
            quickAddDestinationLabel(isInbox = false, projectName = "Cadence", hasDate = false),
        )
        assertEquals(
            "Ajoutée dans Cadence",
            quickAddDestinationLabel(isInbox = false, projectName = "Cadence", hasDate = true),
        )
        assertEquals(
            "Ajoutée dans À classer",
            quickAddDestinationLabel(isInbox = false, projectName = null, hasDate = false),
        )
    }
}
