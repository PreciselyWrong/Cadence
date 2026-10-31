package ch.nicolab.cadence.calendar

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class CalendarCodecsTest {
    @Test
    fun `une clé survit à l'aller-retour, y compris avec des nombres négatifs`() {
        listOf(
            EventInstanceKey(42L, 7L, 1_790_000_000_000L),
            EventInstanceKey(-5L, -42L, -1_000_000_000_000L),
        ).forEach { key ->
            assertEquals(key, CalendarCodecs.decodeKey(CalendarCodecs.encodeKey(key)))
        }
    }

    @Test
    fun `une clé s'encode en calendarId, eventId puis instanceBegin`() {
        assertEquals("1:2:-3", CalendarCodecs.encodeKey(EventInstanceKey(1L, 2L, -3L)))
    }

    @Test
    fun `les huit combinaisons d'affichage survivent à l'aller-retour avec des bits distincts`() {
        val combinations = (0 until 8).map { bits -> CalendarCodecs.decodeDisplay(bits) }

        assertEquals(8, combinations.toSet().size)
        combinations.forEachIndexed { bits, display ->
            assertEquals(bits, CalendarCodecs.encodeDisplay(display))
            assertEquals(display, CalendarCodecs.decodeDisplay(CalendarCodecs.encodeDisplay(display)))
        }
    }

    @Test
    fun `les bits suivent agenda, tâches et widget`() {
        assertEquals(1, CalendarCodecs.encodeDisplay(CalendarDisplay(agenda = true, tasks = false, widget = false)))
        assertEquals(2, CalendarCodecs.encodeDisplay(CalendarDisplay(agenda = false, tasks = true, widget = false)))
        assertEquals(4, CalendarCodecs.encodeDisplay(CalendarDisplay(agenda = false, tasks = false, widget = true)))
    }

    @Test
    fun `une clé mal formée donne null`() {
        listOf("", "1:2", "a:b:c", "1:2:3:4").forEach { value ->
            assertNull(CalendarCodecs.decodeKey(value), value)
        }
    }

    @Test
    fun `un événement masqué survit à l'aller-retour, titre avec séparateurs compris`() {
        listOf(
            HiddenEvent(EventInstanceKey(1L, 2L, 3L), "Réunion", allDay = false),
            HiddenEvent(EventInstanceKey(-1L, 2L, -3L), "Rendez-vous : 10:30 | salle 2\nsuite", allDay = true),
            HiddenEvent(EventInstanceKey(1L, 2L, 3L), "", allDay = false),
        ).forEach { hidden ->
            assertEquals(hidden, CalendarCodecs.decodeHidden(CalendarCodecs.encodeHidden(hidden)))
        }
    }

    @Test
    fun `un événement masqué mal formé est ignoré`() {
        assertNull(CalendarCodecs.decodeHidden("1:2:3"))
        assertNull(CalendarCodecs.decodeHidden("a:2:3:0:titre"))
        assertNull(CalendarCodecs.decodeHidden("1:2:3:x:titre"))
    }
}
