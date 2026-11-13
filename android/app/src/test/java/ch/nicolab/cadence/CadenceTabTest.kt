package ch.nicolab.cadence

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class CadenceTabTest {
    @Test
    fun restoresAKnownTabByName() {
        assertEquals(Tab.AGENDA, tabNamed("AGENDA"))
    }

    @Test
    fun staleInboxTabFallsBackToTasks() {
        assertEquals(Tab.TASKS, tabNamed("INBOX"))
    }

    @Test
    fun missingTabFallsBackToTasks() {
        assertEquals(Tab.TASKS, tabNamed(null))
    }
}
