package ch.nicolab.cadence

import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.AbstinenceProfile
import ch.nicolab.cadence.domain.AlcoholConsumption
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitEvaluator
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitInsights
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.HabitStreak
import ch.nicolab.cadence.domain.HabitTimer
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.ScheduleMode
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ToCompleteSectionTest {

    private val today = LocalDate.of(2026, 9, 10)
    private val zone = ZoneId.of("Europe/Zurich")

    private fun habit(
        id: String,
        isAbstinence: Boolean = false,
        profile: AbstinenceProfile = AbstinenceProfile.NONE,
        archived: Boolean = false,
        consumptions: List<AlcoholConsumption> = emptyList(),
    ): HabitCardState {
        val stored = PersistedHabit(
            id = id,
            name = "Habit $id",
            iconId = "check",
            colorArgb = 0xFF4A6572.toInt(),
            groupId = "group-1",
            sortOrder = 0,
            archived = archived,
            active = true,
            startsOn = today.minusDays(30),
            goal = HabitGoal(1, PeriodType.DAY, goalType = GoalType.DURATION),
            schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY),
            abstinenceProfile = profile,
            timerEnabled = true,
        )
        return HabitCardState(
            stored = stored,
            evaluation = HabitEvaluator().evaluate(stored.definition, today, emptyList(), emptyList()),
            quickValues = listOf(1),
            reminders = emptyList(),
            history = emptyList(),
            entryCount = 0,
            dailyHistory = emptyList(),
            insights = HabitInsights(),
            recentEntries = emptyList(),
            pauses = emptyList(),
            streak = HabitStreak(0, 0),
            alcoholConsumptions = consumptions,
        )
    }

    @Test
    fun `empty list when no habits`() {
        val result = ToCompleteItem.resolve(emptyList(), emptyMap())
        assertTrue(result.isEmpty())
    }

    @Test
    fun `extracts alcohol consumptions with unknown standard drinks`() {
        val unknown = AlcoholConsumption("c-1", "h-1", today.minusDays(1), zone, standardDrinks = null)
        val known = AlcoholConsumption("c-2", "h-1", today.minusDays(2), zone, standardDrinks = 3)
        val alcoholHabit = habit(
            id = "h-1",
            isAbstinence = true,
            profile = AbstinenceProfile.ALCOHOL,
            consumptions = listOf(unknown, known),
        )

        val result = ToCompleteItem.resolve(listOf(alcoholHabit), emptyMap())
        assertEquals(1, result.size)
        val item = result.single() as ToCompleteItem.AlcoholQuantity
        assertEquals("c-1", item.consumption.id)
        assertEquals("alcohol_quantity_c-1", item.key)
        assertEquals("h-1", item.habit.stored.id)
    }

    @Test
    fun `ignores archived habits with unknown consumptions`() {
        val unknown = AlcoholConsumption("c-1", "h-1", today.minusDays(1), zone, standardDrinks = null)
        val archivedHabit = habit(
            id = "h-1",
            isAbstinence = true,
            profile = AbstinenceProfile.ALCOHOL,
            archived = true,
            consumptions = listOf(unknown),
        )

        val result = ToCompleteItem.resolve(listOf(archivedHabit), emptyMap())
        assertTrue(result.isEmpty())
    }

    @Test
    fun `extracts running and paused timers with accumulated time`() {
        val h1 = habit("h-1")
        val h2 = habit("h-2")
        val h3 = habit("h-3")

        val runningTimer = HabitTimer.started("h-1", Instant.now())
        val pausedTimer = HabitTimer("h-2", accumulatedSeconds = 300, runningSince = null)
        val resetTimer = HabitTimer("h-3", accumulatedSeconds = 0, runningSince = null)

        val timers = mapOf(
            "h-1" to runningTimer,
            "h-2" to pausedTimer,
            "h-3" to resetTimer,
        )

        val result = ToCompleteItem.resolve(listOf(h1, h2, h3), timers)
        assertEquals(2, result.size)

        val timerItems = result.filterIsInstance<ToCompleteItem.ActiveTimer>()
        assertEquals(2, timerItems.size)
        assertTrue(timerItems.any { it.timer.habitId == "h-1" && it.key == "active_timer_h-1" })
        assertTrue(timerItems.any { it.timer.habitId == "h-2" && it.key == "active_timer_h-2" })
    }

    @Test
    fun `combines unknown alcohol and active timers together`() {
        val unknown = AlcoholConsumption("c-1", "h-alc", today, zone, standardDrinks = null)
        val alcHabit = habit("h-alc", isAbstinence = true, profile = AbstinenceProfile.ALCOHOL, consumptions = listOf(unknown))
        val timerHabit = habit("h-timer")
        val runningTimer = HabitTimer.started("h-timer", Instant.now())

        val result = ToCompleteItem.resolve(listOf(alcHabit, timerHabit), mapOf("h-timer" to runningTimer))
        assertEquals(2, result.size)
        assertTrue(result[0] is ToCompleteItem.AlcoholQuantity)
        assertTrue(result[1] is ToCompleteItem.ActiveTimer)
    }
}
