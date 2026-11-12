package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class WithLinkFilterTest {
    @Test
    fun `une adresse http ou https dans le nom ou la note suffit`() {
        assertTrue(WithLinkFilter.matches("Lire https://a.io/x", null))
        assertTrue(WithLinkFilter.matches("Tester", "voir http://a.io"))
        assertTrue(WithLinkFilter.matches("Tester", "voir HTTPS://A.io"))
    }

    @Test
    fun `un nom sans adresse, ou un domaine nu, ne compte pas`() {
        assertFalse(WithLinkFilter.matches("Acheter du pain", null))
        assertFalse(WithLinkFilter.matches("Voir github.com", "ftp://a.io"))
        assertFalse(WithLinkFilter.matches("Acheter", ""))
    }

    @Test
    fun `hors filtre, toutes les tâches passent, avec le filtre, seules celles qui ont une adresse`() {
        val tasks = listOf(
            TaskItem(uid = "a", name = "Lire https://a.io"),
            TaskItem(uid = "b", name = "Acheter du pain"),
            TaskItem(uid = "c", name = "Note", note = "https://b.io/y"),
        )
        assertEquals(listOf("a", "b", "c"), WithLinkFilter.tasks(tasks, on = false).map { it.uid })
        assertEquals(listOf("a", "c"), WithLinkFilter.tasks(tasks, on = true).map { it.uid })
    }
}
