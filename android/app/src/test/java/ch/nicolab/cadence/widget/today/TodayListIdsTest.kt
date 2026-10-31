package ch.nicolab.cadence.widget.today

import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TodayListIdsTest {
    /** Glance refuse tout identifiant de ligne inférieur à -2^62 : le widget n'affiche alors plus rien. */
    private val glanceReservedEnd = -(1L shl 62)

    @Test
    fun `les identifiants d'intitules restent hors de la plage reservee par Glance et des taches`() {
        val days = (-400L..400L).map { LocalDate.of(2026, 10, 31).plusDays(it) }
        val ids = listOf(TodayListIds.OVERDUE, TodayListIds.EVENTS, TodayListIds.UNDATED) + days.map(TodayListIds::day)

        ids.forEach { id ->
            assertTrue(id > glanceReservedEnd, "id $id reserve par Glance")
            assertTrue(id < Int.MIN_VALUE.toLong(), "id $id peut croiser le hashCode d'une tache")
        }
        assertEquals(ids.size, ids.toSet().size)
    }
}
