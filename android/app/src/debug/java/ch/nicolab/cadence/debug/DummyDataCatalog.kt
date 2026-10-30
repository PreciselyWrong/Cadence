package ch.nicolab.cadence.debug

import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.MeasurementUnit
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.ScheduleMode
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.ZoneId

internal data class DummyDataSet(
    val habits: List<PersistedHabit>,
    val entries: List<HabitEntry>,
    val quickValues: Map<String, List<Long>>,
)

internal object DummyDataCatalog {
    const val ID_PREFIX = "dummy-"

    fun create(today: LocalDate, zone: ZoneId): DummyDataSet {
        val habits = habits(today)
        val entries = buildList {
            for (offset in 59 downTo 0) {
                val date = today.minusDays(offset.toLong())
                habits.forEach { habit ->
                    valueFor(habit.id, date, today, offset)?.let { value ->
                        add(entry(habit, date, zone, value))
                    }
                }
            }
        }
        return DummyDataSet(
            habits = habits,
            entries = entries,
            quickValues = mapOf(
                "dummy-water" to listOf(1, 2),
                "dummy-reading" to listOf(5, 10, 20),
                "dummy-running" to listOf(3_000, 5_000),
                "dummy-meditation" to listOf(300, 600, 900),
                "dummy-coffee" to listOf(1),
                "dummy-stretch" to listOf(1),
            ),
        )
    }

    private fun habits(today: LocalDate): List<PersistedHabit> {
        val start = today.minusDays(59)
        return listOf(
            habit("dummy-water", "Boire de l’eau", "water", 0xFF4C9DFF.toInt(), "group-morning", start, 0,
                HabitGoal(8, PeriodType.DAY, GoalType.COUNT, MeasurementUnit.GLASS, minimumMinor = 5),
                HabitSchedule(mode = ScheduleMode.EVERY_DAY)),
            habit("dummy-reading", "Lire", "book", 0xFFFFB84D.toInt(), "group-evening", start, 1,
                HabitGoal(20, PeriodType.DAY, GoalType.QUANTITY, MeasurementUnit.PAGE),
                HabitSchedule(activeDays = weekdays(), firstDayOfWeek = DayOfWeek.MONDAY)),
            habit("dummy-running", "Course à pied", "run", 0xFFFF725E.toInt(), "group-day", start, 2,
                HabitGoal(15_000, PeriodType.WEEK, GoalType.QUANTITY, MeasurementUnit.KILOMETERS, frequencyTarget = 3),
                HabitSchedule(activeDays = setOf(DayOfWeek.TUESDAY, DayOfWeek.THURSDAY, DayOfWeek.SUNDAY), firstDayOfWeek = DayOfWeek.MONDAY)),
            habit("dummy-meditation", "Méditer", "meditation", 0xFF9B7BFF.toInt(), "group-morning", start, 3,
                HabitGoal(900, PeriodType.DAY, GoalType.DURATION, MeasurementUnit.MINUTES, minimumMinor = 600),
                HabitSchedule(mode = ScheduleMode.EVERY_DAY), timerEnabled = true),
            habit("dummy-coffee", "Limiter le café", "coffee", 0xFFD59B6D.toInt(), "group-afternoon", start, 4,
                HabitGoal(3, PeriodType.DAY, GoalType.COUNT, MeasurementUnit.COUNT, direction = GoalDirection.AT_MOST),
                HabitSchedule(mode = ScheduleMode.EVERY_DAY)),
            habit("dummy-stretch", "Étirements", "stretch", 0xFF4CD39A.toInt(), "group-evening", today.minusDays(58), 5,
                HabitGoal(1, PeriodType.DAY, GoalType.BINARY),
                HabitSchedule(mode = ScheduleMode.INTERVAL_DAYS, intervalDays = 2)),
        )
    }

    private fun valueFor(habitId: String, date: LocalDate, today: LocalDate, offset: Int): Long? = when (habitId) {
        "dummy-water" -> when {
            offset == 0 -> 5
            offset % 10 == 0 -> 3
            offset % 3 == 0 -> 5
            else -> 8
        }
        "dummy-reading" -> if (date.dayOfWeek in weekdays()) {
            if (offset % 9 == 0) 10 else 20
        } else null
        "dummy-running" -> if (date.dayOfWeek in setOf(DayOfWeek.TUESDAY, DayOfWeek.THURSDAY, DayOfWeek.SUNDAY) &&
            !(offset in 14..20 && date.dayOfWeek == DayOfWeek.SUNDAY)
        ) 5_000 else null
        "dummy-meditation" -> when {
            offset == 0 -> 300
            offset % 11 == 0 -> 300
            offset % 6 == 0 -> 600
            else -> 900
        }
        "dummy-coffee" -> if (date <= today) if (offset % 13 == 0 && offset != 0) 4 else 2 else null
        "dummy-stretch" -> if (offset <= 58 && offset % 2 == 0 && offset % 10 != 0) 1 else null
        else -> null
    }

    private fun entry(habit: PersistedHabit, date: LocalDate, zone: ZoneId, value: Long): HabitEntry {
        val id = "$ID_PREFIX${habit.id.removePrefix(ID_PREFIX)}-$date"
        return HabitEntry(
            id = id,
            habitId = habit.id,
            occurredAt = date.atTime(8 + habit.sortOrder, 0).atZone(zone).toInstant(),
            localDate = date,
            observedZoneId = zone,
            valueMinor = value,
            sessionId = id,
        )
    }

    private fun habit(
        id: String,
        name: String,
        iconId: String,
        colorArgb: Int,
        groupId: String,
        startsOn: LocalDate,
        sortOrder: Int,
        goal: HabitGoal,
        schedule: HabitSchedule,
        timerEnabled: Boolean = false,
    ) = PersistedHabit(
        id = id,
        name = name,
        iconId = iconId,
        colorArgb = colorArgb,
        active = true,
        startsOn = startsOn,
        sortOrder = sortOrder,
        groupId = groupId,
        timerEnabled = timerEnabled,
        goal = goal,
        schedule = schedule,
    )

    private fun weekdays() = setOf(
        DayOfWeek.MONDAY,
        DayOfWeek.TUESDAY,
        DayOfWeek.WEDNESDAY,
        DayOfWeek.THURSDAY,
        DayOfWeek.FRIDAY,
    )
}
