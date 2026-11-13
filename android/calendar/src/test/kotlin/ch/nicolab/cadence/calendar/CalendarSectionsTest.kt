package ch.nicolab.cadence.calendar

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class CalendarSectionsTest {
    private fun calendar(id: Long, account: String, type: String = "com.google", sync: Boolean = true) =
        DeviceCalendar(id, account, type, "Agenda $id", 0, visibleOnDevice = true, syncEvents = sync)

    @Test
    fun `un bloc par compte, dans l'ordre de l'appareil`() {
        val items = listOf(
            CalendarWithDisplay(calendar(1, "perso"), CalendarDisplay()),
            CalendarWithDisplay(calendar(2, "travail"), CalendarDisplay()),
            CalendarWithDisplay(calendar(3, "perso"), CalendarDisplay()),
        )

        val sections = calendarAccountSections(items)

        assertEquals(listOf("perso", "travail"), sections.map { it.accountName })
        assertEquals(listOf(1L, 3L), sections[0].used.map { it.calendar.id })
    }

    @Test
    fun `un même nom de compte sur deux fournisseurs donne deux blocs`() {
        val items = listOf(
            CalendarWithDisplay(calendar(1, "moi", type = "com.google"), CalendarDisplay()),
            CalendarWithDisplay(calendar(2, "moi", type = "local"), CalendarDisplay()),
        )

        assertEquals(2, calendarAccountSections(items).size)
    }

    @Test
    fun `les agendas ignorés, par choix ou faute de synchronisation, passent dans les non utilisés`() {
        val items = listOf(
            CalendarWithDisplay(calendar(1, "perso"), CalendarDisplay()),
            CalendarWithDisplay(calendar(2, "perso"), CalendarDisplay(used = false)),
            CalendarWithDisplay(calendar(3, "perso", sync = false), CalendarDisplay()),
            CalendarWithDisplay(calendar(4, "perso", sync = false), CalendarDisplay(used = true)),
        )

        val section = calendarAccountSections(items).single()

        assertEquals(listOf(1L, 4L), section.used.map { it.calendar.id })
        assertEquals(listOf(2L, 3L), section.unused.map { it.calendar.id })
    }
}
