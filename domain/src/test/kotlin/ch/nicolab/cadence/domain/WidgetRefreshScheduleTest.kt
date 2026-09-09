package ch.nicolab.cadence.domain

import java.time.LocalDateTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class WidgetRefreshScheduleTest {

    private fun group(id: String, start: Int?, end: Int?) =
        HabitGroup(id = id, name = id, startMinute = start, endMinute = end, sortOrder = 0)

    @Test
    fun `sans groupe horaire le prochain reveil est minuit`() {
        val next = WidgetRefreshSchedule.nextBoundary(
            LocalDateTime.of(2026, 8, 14, 15, 30),
            listOf(group("journee", null, null)),
        )
        assertEquals(LocalDateTime.of(2026, 8, 15, 0, 0), next)
    }

    @Test
    fun `la borne de groupe la plus proche devance minuit`() {
        val next = WidgetRefreshSchedule.nextBoundary(
            LocalDateTime.of(2026, 8, 14, 9, 15),
            listOf(group("matin", 6 * 60, 11 * 60), group("soir", 18 * 60, 22 * 60)),
        )
        assertEquals(LocalDateTime.of(2026, 8, 14, 11, 0), next)
    }

    @Test
    fun `une borne deja passee ne retient pas le reveil`() {
        val next = WidgetRefreshSchedule.nextBoundary(
            LocalDateTime.of(2026, 8, 14, 23, 10),
            listOf(group("matin", 6 * 60, 11 * 60)),
        )
        assertEquals(LocalDateTime.of(2026, 8, 15, 0, 0), next)
    }

    @Test
    fun `un compteur vivant rafraichit le widget a la prochaine heure`() {
        val next = WidgetRefreshSchedule.nextBoundary(
            LocalDateTime.of(2026, 8, 14, 15, 30, 45),
            emptyList(),
            refreshEveryMinutes = 60,
        )
        assertEquals(LocalDateTime.of(2026, 8, 14, 16, 0), next)
    }
}
