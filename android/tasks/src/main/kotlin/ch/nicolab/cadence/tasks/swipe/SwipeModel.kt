package ch.nicolab.cadence.tasks.swipe

import kotlin.math.abs

/** Actions assignables à un geste de balayage ; [NONE] désactive le seuil. */
enum class SwipeAction {
    COMPLETE, SCHEDULE, TODAY, TOMORROW, NEXT_WEEK, MOVE_PROJECT, PRIORITY, DELETE, NONE;

    /** Ouvre une feuille de choix au lieu d'agir immédiatement. */
    val opensSheet: Boolean get() = this == SCHEDULE || this == MOVE_PROJECT || this == PRIORITY
}

/** Sens du balayage : [RIGHT] vers la droite (depuis le bord gauche), [LEFT] vers la gauche. */
enum class SwipeSide {
    RIGHT, LEFT;

    companion object {
        fun of(offset: Float): SwipeSide? = when {
            offset > 0f -> RIGHT
            offset < 0f -> LEFT
            else -> null
        }
    }
}

/** Distance parcourue : aucun seuil, premier seuil (court), second seuil (long). */
enum class SwipeStage { NONE, SHORT, LONG }

/** Les quatre actions du balayage ; les défauts suivent l'usage de TickTick et Gmail. */
data class SwipeConfig(
    val rightShort: SwipeAction,
    val rightLong: SwipeAction,
    val leftShort: SwipeAction,
    val leftLong: SwipeAction,
) {
    fun actionFor(side: SwipeSide, stage: SwipeStage): SwipeAction = when (stage) {
        SwipeStage.NONE -> SwipeAction.NONE
        SwipeStage.SHORT -> if (side == SwipeSide.RIGHT) rightShort else leftShort
        SwipeStage.LONG -> if (side == SwipeSide.RIGHT) rightLong else leftLong
    }

    /** Action effective à un étage : un second seuil sans action garde celle du premier. */
    fun resolve(side: SwipeSide, stage: SwipeStage): SwipeAction {
        val exact = actionFor(side, stage)
        return if (stage == SwipeStage.LONG && exact == SwipeAction.NONE) actionFor(side, SwipeStage.SHORT) else exact
    }

    fun isEnabled(side: SwipeSide): Boolean =
        actionFor(side, SwipeStage.SHORT) != SwipeAction.NONE || actionFor(side, SwipeStage.LONG) != SwipeAction.NONE

    fun with(side: SwipeSide, stage: SwipeStage, action: SwipeAction): SwipeConfig = when {
        side == SwipeSide.RIGHT && stage == SwipeStage.SHORT -> copy(rightShort = action)
        side == SwipeSide.RIGHT && stage == SwipeStage.LONG -> copy(rightLong = action)
        side == SwipeSide.LEFT && stage == SwipeStage.SHORT -> copy(leftShort = action)
        side == SwipeSide.LEFT && stage == SwipeStage.LONG -> copy(leftLong = action)
        else -> this
    }

    /** Actions distinctes et réellement configurées, dans l'ordre d'affichage. */
    fun distinctActions(): List<SwipeAction> =
        listOf(rightShort, rightLong, leftShort, leftLong).filter { it != SwipeAction.NONE }.distinct()

    fun encode(): String = listOf(rightShort, rightLong, leftShort, leftLong).joinToString(",") { it.name }

    companion object {
        val Default = SwipeConfig(
            rightShort = SwipeAction.COMPLETE,
            rightLong = SwipeAction.DELETE,
            leftShort = SwipeAction.SCHEDULE,
            leftLong = SwipeAction.MOVE_PROJECT,
        )

        /** Une valeur absente ou illisible retombe sur le défaut de son seul champ. */
        fun decode(value: String?): SwipeConfig {
            val parts = value?.split(",").orEmpty()
            fun at(index: Int, fallback: SwipeAction): SwipeAction =
                parts.getOrNull(index)?.trim()?.let { name -> SwipeAction.entries.firstOrNull { it.name == name } } ?: fallback
            return SwipeConfig(
                rightShort = at(0, Default.rightShort),
                rightLong = at(1, Default.rightLong),
                leftShort = at(2, Default.leftShort),
                leftLong = at(3, Default.leftLong),
            )
        }
    }
}

/** Seuils de balayage, en fractions de la largeur de la ligne. */
object SwipeThresholds {
    const val SHORT_FRACTION = 0.22f
    const val LONG_FRACTION = 0.55f
    const val FLING_VELOCITY_PX = 1800f

    /** [distancePx] peut être signée : seule sa valeur absolue compte. */
    fun stage(distancePx: Float, widthPx: Float, minShortPx: Float = 0f): SwipeStage {
        val distance = abs(distancePx)
        val short = maxOf(widthPx * SHORT_FRACTION, minShortPx)
        val long = maxOf(widthPx * LONG_FRACTION, short * 2f)
        return when {
            distance >= long -> SwipeStage.LONG
            distance >= short -> SwipeStage.SHORT
            else -> SwipeStage.NONE
        }
    }

    /** Au relâchement, un jet dans le sens du geste vaut au moins le premier seuil. */
    fun stageOnRelease(offsetPx: Float, widthPx: Float, velocityPx: Float, minShortPx: Float = 0f): SwipeStage {
        val reached = stage(offsetPx, widthPx, minShortPx)
        val sameDirection = offsetPx != 0f && (offsetPx > 0f) == (velocityPx > 0f)
        val flung = sameDirection && abs(velocityPx) >= FLING_VELOCITY_PX
        return if (reached == SwipeStage.NONE && flung) SwipeStage.SHORT else reached
    }
}
