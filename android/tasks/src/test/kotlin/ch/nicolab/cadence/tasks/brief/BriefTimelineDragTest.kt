package ch.nicolab.cadence.tasks.brief

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class BriefTimelineDragTest {
    @Test
    fun `déplacer garde la durée, arrondit au quart d'heure et reste sur l'axe`() {
        assertEquals(10 * 60 + 15, BriefTimeline.moved(10 * 60, 30, 20f))
        assertEquals(BriefTimeline.FIRST_MINUTE, BriefTimeline.moved(9 * 60, 30, -300f))
        assertEquals(BriefTimeline.LAST_MINUTE - 60, BriefTimeline.moved(20 * 60, 60, 600f))
    }

    @Test
    fun `étirer change la durée au quart d'heure, jamais sous un pas ni au-delà de l'axe`() {
        assertEquals(45, BriefTimeline.resized(10 * 60, 30, 10f))
        assertEquals(BriefTimeline.STEP_MINUTES, BriefTimeline.resized(10 * 60, 30, -120f))
        assertEquals(60, BriefTimeline.resized(21 * 60, 30, 300f))
    }

    @Test
    fun `une fraction de la largeur vaut sa part des 14 heures de l'axe`() {
        assertEquals(420f, BriefTimeline.minutes(0.5f))
    }

    @Test
    fun `seules les lignes à heure d'une tâche connue deviennent des créneaux`() {
        val plan = listOf(
            ch.nicolab.cadence.tasks.planning.PlanEntry("a", java.time.LocalDate.of(2026, 11, 12), 540, null),
            ch.nicolab.cadence.tasks.planning.PlanEntry("b", java.time.LocalDate.of(2026, 11, 12), null, 30),
            ch.nicolab.cadence.tasks.planning.PlanEntry("inconnue", java.time.LocalDate.of(2026, 11, 12), 600, 45),
        )
        val tasks = listOf(ch.nicolab.cadence.tasks.model.TaskItem("a", "Appel", estimatedMinutes = 20), ch.nicolab.cadence.tasks.model.TaskItem("b", "b"))
        assertEquals(listOf(TimelineSlot("a", "Appel", 540, 20)), BriefSlots.of(plan, tasks))
    }
}
