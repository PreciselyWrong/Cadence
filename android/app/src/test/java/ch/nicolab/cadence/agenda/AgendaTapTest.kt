package ch.nicolab.cadence.agenda

import java.time.LocalDateTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AgendaTapTest {
    private val at = LocalDateTime.of(2026, 11, 7, 9, 0)

    private fun task(virtual: Boolean = false) = AgendaEntry.Task(
        uid = "t-1",
        title = "Appeler le garage",
        start = at,
        end = at,
        allDay = false,
        done = false,
        colorArgb = null,
        recurring = virtual,
        virtual = virtual,
    )

    private fun recording(opened: MutableList<String>) = AgendaEventActions(
        open = { opened += "event" },
        menu = {},
        toggleTask = { opened += "toggle" },
        openTask = { opened += "task:${it.uid}" },
        openHabit = { opened += "habit" },
    )

    @Test
    fun `toucher une tâche ouvre sa fiche sans la cocher`() {
        val opened = mutableListOf<String>()

        recording(opened).tap(task())

        assertEquals(listOf("task:t-1"), opened)
    }

    @Test
    fun `toucher une occurrence à venir ouvre la tâche enregistrée de la série`() {
        val opened = mutableListOf<String>()

        recording(opened).tap(task(virtual = true))

        assertEquals(listOf("task:t-1"), opened)
    }
}
