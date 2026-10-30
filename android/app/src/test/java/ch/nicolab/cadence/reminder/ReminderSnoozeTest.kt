package ch.nicolab.cadence.reminder

import ch.nicolab.cadence.data.local.entities.HabitReminderEntity
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitPause
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.HabitEvaluator
import ch.nicolab.cadence.domain.MeasurementUnit
import ch.nicolab.cadence.domain.PauseReason
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.ScheduleMode
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ReminderSnoozeTest {

    private val zurichZone = ZoneId.of("Europe/Zurich")
    private val evaluator = HabitEvaluator()

    @Test
    fun `ordinary limit snooze delivers while staying under the limit`() {
        val today = LocalDate.of(2026, 9, 7)
        val habit = PersistedHabit(
            id = "habit-coffee",
            name = "Café",
            active = true,
            goal = HabitGoal(2, PeriodType.DAY, GoalType.COUNT, direction = GoalDirection.AT_MOST),
            schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY),
        )
        val reminder = HabitReminderEntity("rem-coffee", habit.id, "10:00", "", true, true)
        val evaluation = evaluator.evaluate(
            habit.definition,
            today,
            listOf(HabitEntry("e1", habit.id, Instant.parse("2026-09-07T08:00:00Z"), today, zurichZone, 1)),
        )

        assertTrue(evaluation.isCompleted)
        assertTrue(evaluation.needsAttentionNow)
        assertTrue(ReminderSnooze.shouldDeliverSnooze(habit, reminder, evaluation))
    }

    @Test
    fun `cross midnight snooze suppresses delivery if target day is not planned`() {
        val monday = LocalDate.of(2026, 9, 7)
        val tuesday = LocalDate.of(2026, 9, 8)
        // Habitude planifiée uniquement le lundi
        val habit = PersistedHabit(
            id = "habit-reading",
            name = "Lecture",
            active = true,
            goal = HabitGoal(30, PeriodType.DAY, GoalType.COUNT),
            schedule = HabitSchedule(
                mode = ScheduleMode.SELECTED_DAYS,
                activeDays = setOf(DayOfWeek.MONDAY),
            ),
        )
        val reminder = HabitReminderEntity("rem-read", habit.id, "23:45", "MONDAY", true, true)

        // Réveil du snooze mardi à 00h15 : mardi n'est pas planifié
        val tuesdayEvaluation = evaluator.evaluate(habit.definition, tuesday, emptyList())
        assertFalse(tuesdayEvaluation.isPlannedForDate)
        assertFalse(ReminderSnooze.shouldDeliverSnooze(habit, reminder, tuesdayEvaluation))
    }

    @Test
    fun `cross midnight snooze delivers if target day is planned and needs attention`() {
        val tuesday = LocalDate.of(2026, 9, 8)
        // Habitude planifiée tous les jours
        val habit = PersistedHabit(
            id = "habit-stretch",
            name = "Étirements",
            active = true,
            goal = HabitGoal(1, PeriodType.DAY, GoalType.BINARY),
            schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY),
        )
        val reminder = HabitReminderEntity("rem-stretch", habit.id, "23:45", "", true, true)

        // Réveil mardi à 00h15 : mardi est planifié, pas de saisie, pas de pause
        val tuesdayEvaluation = evaluator.evaluate(habit.definition, tuesday, emptyList())
        assertTrue(tuesdayEvaluation.isPlannedForDate)
        assertTrue(tuesdayEvaluation.needsAttentionNow)
        assertTrue(ReminderSnooze.shouldDeliverSnooze(habit, reminder, tuesdayEvaluation))
    }

    @Test
    fun `cross midnight snooze suppresses delivery if target day is paused`() {
        val tuesday = LocalDate.of(2026, 9, 8)
        val habit = PersistedHabit(
            id = "habit-stretch",
            name = "Étirements",
            active = true,
            goal = HabitGoal(1, PeriodType.DAY, GoalType.BINARY),
            schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY),
        )
        val reminder = HabitReminderEntity("rem-stretch", habit.id, "23:45", "", true, true)
        val pause = HabitPause.skip(tuesday, PauseReason.REST)

        val evaluation = evaluator.evaluate(habit.definition, tuesday, emptyList(), listOf(pause))
        assertTrue(evaluation.isPaused)
        assertFalse(ReminderSnooze.shouldDeliverSnooze(habit, reminder, evaluation))
    }

    @Test
    fun `snooze delivery suppresses completed habit and does not wake it`() {
        val today = LocalDate.of(2026, 9, 7)
        val habit = PersistedHabit(
            id = "habit-water",
            name = "Boire de l'eau",
            active = true,
            goal = HabitGoal(2, PeriodType.DAY, GoalType.COUNT),
            schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY),
        )
        val reminder = HabitReminderEntity("rem-water", habit.id, "10:00", "", true, true)
        val entries = listOf(
            HabitEntry("e1", habit.id, Instant.parse("2026-09-07T09:00:00Z"), today, zurichZone, 1),
            HabitEntry("e2", habit.id, Instant.parse("2026-09-07T10:15:00Z"), today, zurichZone, 1),
        )

        // L'habitude a été complétée pendant les 30 min de snooze
        val evaluation = evaluator.evaluate(habit.definition, today, entries)
        assertTrue(evaluation.isCompleted)
        assertFalse(ReminderSnooze.shouldDeliverSnooze(habit, reminder, evaluation))
    }

    @Test
    fun `snooze delivery suppresses when reminder is removed disabled or mismatched`() {
        val today = LocalDate.of(2026, 9, 7)
        val habit = PersistedHabit(
            id = "habit-water",
            name = "Boire de l'eau",
            active = true,
            goal = HabitGoal(2, PeriodType.DAY, GoalType.COUNT),
            schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY),
        )
        val evaluation = evaluator.evaluate(habit.definition, today, emptyList())

        // Rappel supprimé
        assertFalse(ReminderSnooze.shouldDeliverSnooze(habit, null, evaluation))

        // Rappel désactivé
        val disabledReminder = HabitReminderEntity("rem-water", habit.id, "10:00", "", false, true)
        assertFalse(ReminderSnooze.shouldDeliverSnooze(habit, disabledReminder, evaluation))

        // Rappel d'une autre habitude
        val mismatchedReminder = HabitReminderEntity("rem-other", "other-habit", "10:00", "", true, true)
        assertFalse(ReminderSnooze.shouldDeliverSnooze(habit, mismatchedReminder, evaluation))

        // Habitude désactivée ou archivée
        val inactiveHabit = habit.copy(active = false)
        val validReminder = HabitReminderEntity("rem-water", habit.id, "10:00", "", true, true)
        assertFalse(ReminderSnooze.shouldDeliverSnooze(inactiveHabit, validReminder, evaluation))

        val archivedHabit = habit.copy(archived = true)
        assertFalse(ReminderSnooze.shouldDeliverSnooze(archivedHabit, validReminder, evaluation))
    }

    @Test
    fun `abstinence habit delivers snooze check-in without fake success`() {
        val today = LocalDate.of(2026, 9, 7)
        val habit = PersistedHabit(
            id = "abst-alcohol",
            name = "Alcool",
            active = true,
            goal = HabitGoal(0, PeriodType.DAY, GoalType.COUNT, direction = GoalDirection.AT_MOST),
            schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY),
        )
        val reminder = HabitReminderEntity("rem-abst", habit.id, "19:00", "", true, true)

        // Pas d'écart : l'abstinence a 0 saisie
        val evaluation = evaluator.evaluate(habit.definition, today, emptyList())
        assertTrue(habit.goal.isAbstinence)
        // En abstinence, 0 saisie ne compte pas comme "complété" interdisant le point de rappel
        assertTrue(ReminderSnooze.shouldDeliverSnooze(habit, reminder, evaluation))
        // Et les actions de saisie restent refusées pour empêcher tout faux succès
        assertFalse(ReminderNotifications.allowsEntryAction(habit.goal))
    }

    @Test
    fun `remaining message fixes duration suffix repetition`() {
        val durationHabit = PersistedHabit(
            id = "habit-meditation",
            name = "Méditation",
            active = true,
            goal = HabitGoal(
                targetMinor = 1800L,
                period = PeriodType.DAY,
                goalType = GoalType.DURATION,
                unit = MeasurementUnit.MINUTES,
            ),
            schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY),
        )

        // formatValue donne déjà "30 min", le message ne doit pas répéter "min min"
        val message = ReminderNotifications.remainingMessage(durationHabit, 0L)
        assertEquals("Il reste 30 min", message)
    }
}
