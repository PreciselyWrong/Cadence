package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class TaskDisplayTest {
    @Test
    fun `estimates read as minutes, hours or both`() {
        assertEquals("45 min", EstimateFormat.format(45))
        assertEquals("1 h", EstimateFormat.format(60))
        assertEquals("1 h 30", EstimateFormat.format(90))
        assertEquals("3 h", EstimateFormat.format(180))
    }

    @Test
    fun `only read-only extras with a value are listed, in a stable order`() {
        val rows = TaskExtraRows.visible(
            mapOf(
                "updated_at" to "2026-10-28T10:00:00Z",
                "review_on" to "2026-11-02",
                "week_of" to "",
                "start_date" to "2026-10-27T00:00:00Z",
                "estimated_minutes" to "90",
            ),
        )
        assertEquals(listOf("review_on", "updated_at"), rows.map { it.key })
    }
}
