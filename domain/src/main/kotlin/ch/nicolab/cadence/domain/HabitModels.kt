package ch.nicolab.cadence.domain

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

enum class PeriodType {
    DAY,
    WEEK,
    MONTH,
}

data class HabitGoal(
    val targetMinor: Long,
    val period: PeriodType,
) {
    init {
        require(targetMinor > 0) { "Target must be positive" }
    }
}

data class HabitSchedule(
    val activeDays: Set<DayOfWeek>,
    val firstDayOfWeek: DayOfWeek,
) {
    init {
        require(activeDays.isNotEmpty()) { "At least one active day is required" }
    }
}

data class HabitDefinition(
    val id: String,
    val active: Boolean,
    val goal: HabitGoal,
    val schedule: HabitSchedule,
)

data class HabitEntry(
    val id: String,
    val habitId: String,
    val occurredAt: Instant,
    val localDate: LocalDate,
    val observedZoneId: ZoneId,
    val valueMinor: Long,
) {
    init {
        require(valueMinor > 0) { "Entry value must be positive" }
    }
}

data class HabitPause(
    val start: LocalDate,
    val endExclusive: LocalDate?,
) {
    init {
        require(endExclusive == null || endExclusive > start) { "Pause end must be after start" }
    }

    fun includes(date: LocalDate): Boolean = date >= start && (endExclusive == null || date < endExclusive)
}
