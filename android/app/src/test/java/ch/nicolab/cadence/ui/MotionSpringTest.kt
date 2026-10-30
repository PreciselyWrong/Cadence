package ch.nicolab.cadence.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.SpringSpec
import ch.nicolab.cadence.ui.theme.Motion
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Test

class MotionSpringTest {
    @Test
    fun `motion specs use critically damped springs for interruptible physics`() {
        val quick = assertInstanceOf(SpringSpec::class.java, Motion.quick<Float>())
        assertEquals(Spring.DampingRatioNoBouncy, quick.dampingRatio)
        assertEquals(Spring.StiffnessMedium, quick.stiffness)

        val normal = assertInstanceOf(SpringSpec::class.java, Motion.normal<Float>())
        assertEquals(Spring.DampingRatioNoBouncy, normal.dampingRatio)
        assertEquals(Spring.StiffnessMediumLow, normal.stiffness)

        val expressive = assertInstanceOf(SpringSpec::class.java, Motion.expressive<Float>())
        assertEquals(Spring.DampingRatioNoBouncy, expressive.dampingRatio)
        assertEquals(Spring.StiffnessLow, expressive.stiffness)

        val interactive = assertInstanceOf(SpringSpec::class.java, Motion.interactive<Float>())
        assertEquals(Spring.DampingRatioNoBouncy, interactive.dampingRatio)
        assertEquals(Spring.StiffnessHigh, interactive.stiffness)
    }
}
