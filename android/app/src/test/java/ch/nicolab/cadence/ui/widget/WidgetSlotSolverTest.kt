package ch.nicolab.cadence.ui.widget

import ch.nicolab.cadence.domain.WidgetSlotMode
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class WidgetSlotSolverTest {

    @Test
    fun `souple elargit les emplacements quand des habitudes disparaissent`() {
        val five = WidgetSlotSolver.solve(320, 32, 5, 5, WidgetSlotMode.FLEXIBLE)
        val two = WidgetSlotSolver.solve(320, 32, 2, 5, WidgetSlotMode.FLEXIBLE)
        assertEquals(5, five.visibleCount)
        assertEquals(2, two.visibleCount)
        assertTrue(two.slotWidthDp > five.slotWidthDp)
    }

    @Test
    fun `fixe garde la meme largeur d emplacement quel que soit le nombre affiche`() {
        val five = WidgetSlotSolver.solve(320, 32, 5, 5, WidgetSlotMode.FIXED)
        val two = WidgetSlotSolver.solve(320, 32, 2, 5, WidgetSlotMode.FIXED)
        assertEquals(five.slotWidthDp, two.slotWidthDp, 0.001f)
        assertEquals(2, two.visibleCount)
        assertFalse(two.showsOverflow)
    }

    @Test
    fun `une largeur insuffisante reserve un emplacement au compteur`() {
        val layout = WidgetSlotSolver.solve(140, 48, 6, 6, WidgetSlotMode.FIXED)
        assertTrue(layout.showsOverflow)
        assertEquals(6, layout.visibleCount + layout.overflowCount)
    }

    @Test
    fun `sans habitude la ligne ne reserve rien`() {
        val layout = WidgetSlotSolver.solve(320, 32, 0, 4, WidgetSlotMode.FIXED)
        assertEquals(0, layout.visibleCount)
        assertFalse(layout.showsOverflow)
    }
}
