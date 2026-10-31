package ch.nicolab.cadence.tasks.swipe

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class EventActionsTest {

    @Test
    fun `terminer coche l'événement quand la case est active`() {
        assertEquals(SwipeAction.COMPLETE, EventActions.map(SwipeAction.COMPLETE, checkable = true))
    }

    @Test
    fun `terminer disparaît quand cocher un événement est désactivé`() {
        assertEquals(SwipeAction.NONE, EventActions.map(SwipeAction.COMPLETE, checkable = false))
    }

    @Test
    fun `supprimer masque l'événement, dans Cadence seulement`() {
        assertEquals(SwipeAction.DELETE, EventActions.map(SwipeAction.DELETE, checkable = true))
        assertEquals(SwipeAction.DELETE, EventActions.map(SwipeAction.DELETE, checkable = false))
    }

    @Test
    fun `planifier, déplacer et prioriser n'ont pas de sens pour un événement`() {
        listOf(
            SwipeAction.SCHEDULE, SwipeAction.TODAY, SwipeAction.TOMORROW, SwipeAction.NEXT_WEEK,
            SwipeAction.MOVE_PROJECT, SwipeAction.PRIORITY,
        ).forEach { assertEquals(SwipeAction.NONE, EventActions.map(it, checkable = true), it.name) }
    }

    @Test
    fun `le réglage par défaut garde terminer à droite et masquer au second seuil`() {
        val config = EventActions.swipeConfig(SwipeConfig.Default, checkable = true)

        assertEquals(SwipeAction.COMPLETE, config.rightShort)
        assertEquals(SwipeAction.DELETE, config.rightLong)
        assertEquals(SwipeAction.NONE, config.leftShort)
        assertEquals(SwipeAction.NONE, config.leftLong)
        assertTrue(config.isEnabled(SwipeSide.RIGHT))
        assertFalse(config.isEnabled(SwipeSide.LEFT))
    }

    @Test
    fun `un réglage sans action applicable désactive le balayage`() {
        val config = EventActions.swipeConfig(
            SwipeConfig(SwipeAction.COMPLETE, SwipeAction.NONE, SwipeAction.SCHEDULE, SwipeAction.PRIORITY),
            checkable = false,
        )

        assertFalse(config.isEnabled(SwipeSide.RIGHT))
        assertFalse(config.isEnabled(SwipeSide.LEFT))
    }

    @Test
    fun `le menu d'appui long propose terminer puis masquer`() {
        assertEquals(listOf(SwipeAction.COMPLETE, SwipeAction.DELETE), EventActions.menu(checkable = true))
        assertEquals(listOf(SwipeAction.DELETE), EventActions.menu(checkable = false))
    }
}
