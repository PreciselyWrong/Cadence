package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.tasks.planning.TodayDrop.Row
import ch.nicolab.cadence.tasks.planning.TodayDrop.Target
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TodayDropTest {
    private val day = LocalDate.of(2026, 11, 14)
    private val toPlace = listOf("a", "b", "c")
    private val planned = setOf("a", "c")
    private val now = 16 * 60 + 47

    private fun target(above: Row?, below: Row?, dragged: String = "x", duration: Int = 30) =
        TodayDrop.target(above, below, dragged, toPlace, planned, now, duration)

    @Test
    fun `lâchée dans À caser, elle se range devant la prochaine tâche prévue`() {
        assertEquals(Target.Untimed("a"), target(Row.ToPlaceTitle, Row.ToPlace("a")))
        assertEquals(Target.Untimed("c"), target(Row.ToPlace("a"), Row.ToPlace("b")))
        assertEquals(Target.Untimed(null), target(Row.ToPlace("c"), Row.DayTitle))
        assertEquals(Target.Untimed(null), target(Row.ToPlaceMore, Row.DayTitle))
        // Juste au-dessus du titre « À caser » : en tête.
        assertEquals(Target.Untimed("a"), target(Row.Late, Row.ToPlaceTitle))
        // La tâche tirée ne sert pas de repère.
        assertEquals(Target.Untimed("c"), target(Row.ToPlaceTitle, Row.ToPlace("a"), dragged = "a"))
    }

    @Test
    fun `lâchée dans Ma journée, elle commence à la fin de ce qui la précède, au quart d'heure`() {
        assertEquals(Target.At(18 * 60 + 30), target(Row.DayItem(17 * 60 + 45, 18 * 60 + 20), Row.DayItem(19 * 60, 20 * 60)))
        assertEquals(Target.At(17 * 60), target(Row.Now(now), Row.Free(now, 17 * 60 + 45)))
        assertEquals(Target.At(17 * 60), target(Row.Free(now, 17 * 60 + 45), Row.DayItem(17 * 60 + 45, 18 * 60)))
    }

    @Test
    fun `entre deux éléments qui se chevauchent, elle reste entre eux`() {
        // Apéro 17:45-18:30, marinades à 18:00 : lâchée entre les deux, elle commence avec l'apéro.
        assertEquals(Target.At(17 * 60 + 45), target(Row.DayItem(17 * 60 + 45, 18 * 60 + 30), Row.DayItem(18 * 60, 18 * 60 + 20)))
        // Assez de place avant le suivant : elle finit quand il commence.
        assertEquals(Target.At(19 * 60), target(Row.DayItem(18 * 60, 21 * 60), Row.DayItem(19 * 60 + 30, 20 * 60)))
    }

    @Test
    fun `en tête de la journée, elle finit quand commence la suivante`() {
        assertEquals(Target.At(18 * 60 + 15), target(Row.DayTitle, Row.DayItem(18 * 60 + 45, 19 * 60), duration = 30))
        // Une journée entière n'a pas d'heure : on regarde la suivante.
        assertEquals(Target.At(18 * 60), target(Row.DayItem(null, null), Row.DayItem(18 * 60 + 30, 19 * 60)))
    }

    @Test
    fun `jamais avant maintenant ni après minuit`() {
        assertEquals(Target.At(17 * 60), target(Row.DayItem(15 * 60, 17 * 60 + 30 - 60), Row.Now(now)))
        assertEquals(Target.At(17 * 60), target(Row.PastFold, Row.DayItem(15 * 60, 16 * 60)))
        assertEquals(Target.At(24 * 60 - 60), target(Row.DayItem(23 * 60, 23 * 60 + 50), null, duration = 60))
    }

    @Test
    fun `parmi les échues, rien`() {
        assertNull(target(Row.Late, Row.Late))
        assertNull(target(null, Row.Late))
    }

    @Test
    fun `écritures dans À caser`() {
        // Prévue avec une heure : l'heure part, la ligne se range.
        assertEquals(
            listOf(UnslotTask(day, "x", ), ReorderTask(day, "x", "a")),
            TodayDrop.writes("x", Target.Untimed("a"), day, PlanEntry("x", day, 600, 30), dueHasTime = false),
        )
        assertEquals(listOf(ReorderTask(day, "x", null)), TodayDrop.writes("x", Target.Untimed(null), day, PlanEntry("x", day, null, null), false))
        assertEquals(listOf(AddTask(day, "x", "c")), TodayDrop.writes("x", Target.Untimed("c"), day, null, false))
        // Son heure vient de l'échéance : le plan ne peut pas la retirer.
        assertTrue(TodayDrop.writes("x", Target.Untimed(null), day, null, dueHasTime = true).isEmpty())
    }

    @Test
    fun `écritures dans Ma journée`() {
        assertEquals(listOf(SlotTask(day, "x", 1080, 45)), TodayDrop.writes("x", Target.At(1080), day, PlanEntry("x", day, 600, 45), false, estimate = 20))
        assertEquals(listOf(SlotTask(day, "x", 1080, 20)), TodayDrop.writes("x", Target.At(1080), day, null, false, estimate = 20))
        assertEquals(listOf(SlotTask(day, "x", 1080, 30)), TodayDrop.writes("x", Target.At(1080), day, null, false))
        assertTrue(TodayDrop.writes("x", Target.At(600), day, PlanEntry("x", day, 600, 30), false).isEmpty())
    }
}
