package ch.nicolab.cadence

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class TaskOpeningTest {
    @Test
    fun `a task from a widget or reminder opens once`() {
        val opened = TaskOpening().fromLaunch("t1")
        assertEquals("t1", opened.pending)

        // Retour dans Tâches après Inbox : l'extra de l'intent est toujours là, la tâche ne se rouvre pas.
        assertNull(opened.consumed().fromLaunch("t1").pending)
    }

    @Test
    fun `no launch request leaves nothing to open`() {
        assertNull(TaskOpening().fromLaunch(null).pending)
    }

    @Test
    fun `a task requested from Bilan opens after the launch one was served`() {
        val served = TaskOpening().fromLaunch("t1").consumed()
        assertEquals("t2", served.request("t2").pending)
        assertNull(served.request("t2").consumed().fromLaunch("t1").pending)
    }

    @Test
    fun `the state survives a save and restore`() {
        val opening = TaskOpening().fromLaunch("t1")
        assertEquals(opening, TaskOpening.restore(opening.save()))
    }
}
