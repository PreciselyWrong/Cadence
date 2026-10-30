package ch.nicolab.cadence.tasks.ui

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class ProjectRailColorTest {
    @Test
    fun `reads hex with or without hash`() {
        assertEquals(0xFF2E7D32.toInt(), projectRailColor("#2E7D32"))
        assertEquals(0xFF2E7D32.toInt(), projectRailColor("2E7D32"))
    }

    @Test
    fun `absent or unreadable colour gives no rail`() {
        assertNull(projectRailColor(null))
        assertNull(projectRailColor(""))
        assertNull(projectRailColor("vert"))
    }
}
