package ch.nicolab.cadence

import androidx.health.connect.client.records.ExerciseSessionRecord
import ch.nicolab.cadence.health.HealthExerciseCatalog
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class HealthExerciseCatalogTest {
    @Test
    fun `catalog exposes unique localized choices for core workout types`() {
        val values = HealthExerciseCatalog.types.map { it.value }

        assertEquals(values.size, values.distinct().size)
        assertTrue(HealthExerciseCatalog.types.all { it.label != 0 })
        assertTrue(
            values.containsAll(
                listOf(
                    ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
                    ExerciseSessionRecord.EXERCISE_TYPE_BIKING,
                    ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL,
                    ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING,
                    ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT,
                ),
            ),
        )
    }
}
