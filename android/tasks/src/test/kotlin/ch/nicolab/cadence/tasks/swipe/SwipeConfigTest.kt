package ch.nicolab.cadence.tasks.swipe

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SwipeConfigTest {
    @Test
    fun `défauts - droite terminer puis supprimer, gauche planifier puis projet`() {
        val config = SwipeConfig.Default
        assertEquals(SwipeAction.COMPLETE, config.actionFor(SwipeSide.RIGHT, SwipeStage.SHORT))
        assertEquals(SwipeAction.DELETE, config.actionFor(SwipeSide.RIGHT, SwipeStage.LONG))
        assertEquals(SwipeAction.SCHEDULE, config.actionFor(SwipeSide.LEFT, SwipeStage.SHORT))
        assertEquals(SwipeAction.MOVE_PROJECT, config.actionFor(SwipeSide.LEFT, SwipeStage.LONG))
    }

    @Test
    fun `aucune action avant le premier seuil`() {
        assertEquals(SwipeAction.NONE, SwipeConfig.Default.actionFor(SwipeSide.RIGHT, SwipeStage.NONE))
    }

    @Test
    fun `un seuil long sans action retombe sur l'action courte`() {
        val config = SwipeConfig.Default.with(SwipeSide.RIGHT, SwipeStage.LONG, SwipeAction.NONE)
        assertEquals(SwipeAction.COMPLETE, config.resolve(SwipeSide.RIGHT, SwipeStage.LONG))
        assertEquals(SwipeAction.COMPLETE, config.resolve(SwipeSide.RIGHT, SwipeStage.SHORT))
    }

    @Test
    fun `un côté sans action ne résout jamais rien`() {
        val config = SwipeConfig.Default
            .with(SwipeSide.LEFT, SwipeStage.SHORT, SwipeAction.NONE)
            .with(SwipeSide.LEFT, SwipeStage.LONG, SwipeAction.NONE)
        assertEquals(SwipeAction.NONE, config.resolve(SwipeSide.LEFT, SwipeStage.LONG))
        assertEquals(false, config.isEnabled(SwipeSide.LEFT))
        assertEquals(true, config.isEnabled(SwipeSide.RIGHT))
    }

    @Test
    fun `un court seuil vide laisse l'action longue`() {
        val config = SwipeConfig.Default.with(SwipeSide.LEFT, SwipeStage.SHORT, SwipeAction.NONE)
        assertEquals(SwipeAction.NONE, config.resolve(SwipeSide.LEFT, SwipeStage.SHORT))
        assertEquals(SwipeAction.MOVE_PROJECT, config.resolve(SwipeSide.LEFT, SwipeStage.LONG))
    }

    @Test
    fun `encode puis decode redonne la configuration`() {
        val config = SwipeConfig(SwipeAction.TOMORROW, SwipeAction.NEXT_WEEK, SwipeAction.PRIORITY, SwipeAction.NONE)
        assertEquals(config, SwipeConfig.decode(config.encode()))
    }

    @Test
    fun `decode retombe sur les défauts par champ`() {
        assertEquals(SwipeConfig.Default, SwipeConfig.decode(null))
        assertEquals(SwipeConfig.Default, SwipeConfig.decode(""))
        val partial = SwipeConfig.decode("TOMORROW,???")
        assertEquals(SwipeAction.TOMORROW, partial.rightShort)
        assertEquals(SwipeConfig.Default.rightLong, partial.rightLong)
        assertEquals(SwipeConfig.Default.leftShort, partial.leftShort)
    }

    @Test
    fun `les actions distinctes ignorent Aucune et les doublons`() {
        val config = SwipeConfig(SwipeAction.COMPLETE, SwipeAction.COMPLETE, SwipeAction.NONE, SwipeAction.DELETE)
        assertEquals(listOf(SwipeAction.COMPLETE, SwipeAction.DELETE), config.distinctActions())
    }
}

class SwipeThresholdsTest {
    private val width = 1000f

    @Test
    fun `sous le premier seuil aucun étage`() {
        assertEquals(SwipeStage.NONE, SwipeThresholds.stage(100f, width))
    }

    @Test
    fun `entre les seuils étage court`() {
        assertEquals(SwipeStage.SHORT, SwipeThresholds.stage(300f, width))
    }

    @Test
    fun `au delà du second seuil étage long`() {
        assertEquals(SwipeStage.LONG, SwipeThresholds.stage(650f, width))
    }

    @Test
    fun `le sens du déplacement ne compte pas pour l'étage`() {
        assertEquals(SwipeStage.LONG, SwipeThresholds.stage(-650f, width))
    }

    @Test
    fun `le premier seuil a un minimum absolu sur une ligne étroite`() {
        assertEquals(SwipeStage.NONE, SwipeThresholds.stage(100f, 200f, minShortPx = 150f))
        assertEquals(SwipeStage.SHORT, SwipeThresholds.stage(160f, 200f, minShortPx = 150f))
    }

    @Test
    fun `un jet rapide vaut au moins le premier seuil`() {
        assertEquals(SwipeStage.SHORT, SwipeThresholds.stageOnRelease(40f, width, velocityPx = 2500f))
        assertEquals(SwipeStage.NONE, SwipeThresholds.stageOnRelease(40f, width, velocityPx = 300f))
    }

    @Test
    fun `un jet ne dégrade pas un étage long`() {
        assertEquals(SwipeStage.LONG, SwipeThresholds.stageOnRelease(700f, width, velocityPx = 2500f))
    }

    @Test
    fun `un jet en sens inverse ne déclenche rien`() {
        assertEquals(SwipeStage.NONE, SwipeThresholds.stageOnRelease(40f, width, velocityPx = -2500f))
    }

    @Test
    fun `le côté suit le signe du déplacement`() {
        assertEquals(SwipeSide.RIGHT, SwipeSide.of(12f))
        assertEquals(SwipeSide.LEFT, SwipeSide.of(-12f))
        assertEquals(null, SwipeSide.of(0f))
    }
}
