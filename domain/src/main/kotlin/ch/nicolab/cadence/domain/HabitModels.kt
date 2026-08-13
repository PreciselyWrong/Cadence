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

enum class GoalType {
    BINARY,
    COUNT,
    QUANTITY,
    DURATION,
}

enum class UnitDimension {
    TIME,
    COUNT,
    DISTANCE,
    MASS,
    VOLUME,
    CUSTOM,
}

data class MeasurementUnit(
    val id: String,
    val dimension: UnitDimension,
    val nameFr: String,
    val symbol: String,
    val scaleToCanonical: Long = 1L,
) {
    init {
        require(id.isNotBlank()) { "Unit id cannot be blank" }
        require(scaleToCanonical > 0) { "Scale to canonical must be positive" }
    }

    companion object {
        val SECONDS = MeasurementUnit("seconds", UnitDimension.TIME, "Secondes", "s", 1L)
        val MINUTES = MeasurementUnit("minutes", UnitDimension.TIME, "Minutes", "min", 60L)
        val HOURS = MeasurementUnit("hours", UnitDimension.TIME, "Heures", "h", 3600L)

        val COUNT = MeasurementUnit("count", UnitDimension.COUNT, "Fois", "x", 1L)
        val REPETITION = MeasurementUnit("repetition", UnitDimension.COUNT, "Répétitions", "rép", 1L)
        val SET = MeasurementUnit("set", UnitDimension.COUNT, "Séries", "séries", 1L)
        val SESSION = MeasurementUnit("session", UnitDimension.COUNT, "Séances", "séances", 1L)
        val STEP = MeasurementUnit("step", UnitDimension.COUNT, "Étapes", "étapes", 1L)
        val PAGE = MeasurementUnit("page", UnitDimension.COUNT, "Pages", "pages", 1L)
        val GLASS = MeasurementUnit("glass", UnitDimension.COUNT, "Verres", "verres", 1L)
        val ITEM = MeasurementUnit("item", UnitDimension.COUNT, "Éléments", "éléments", 1L)

        val METERS = MeasurementUnit("meters", UnitDimension.DISTANCE, "Mètres", "m", 1L)
        val KILOMETERS = MeasurementUnit("kilometers", UnitDimension.DISTANCE, "Kilomètres", "km", 1000L)

        val GRAMS = MeasurementUnit("grams", UnitDimension.MASS, "Grammes", "g", 1L)
        val KILOGRAMS = MeasurementUnit("kilograms", UnitDimension.MASS, "Kilogrammes", "kg", 1000L)

        val MILLILITERS = MeasurementUnit("milliliters", UnitDimension.VOLUME, "Millilitres", "ml", 1L)
        val CENTILITERS = MeasurementUnit("centiliters", UnitDimension.VOLUME, "Centilitres", "cl", 10L)
        val LITERS = MeasurementUnit("liters", UnitDimension.VOLUME, "Litres", "l", 1000L)

        val BUILT_INS = listOf(
            SECONDS, MINUTES, HOURS,
            COUNT, REPETITION, SET, SESSION, STEP, PAGE, GLASS, ITEM,
            METERS, KILOMETERS,
            GRAMS, KILOGRAMS,
            MILLILITERS, CENTILITERS, LITERS,
        )

        fun findById(id: String): MeasurementUnit? = BUILT_INS.firstOrNull { it.id == id }
    }
}

enum class ScheduleMode {
    EVERY_DAY,
    SELECTED_DAYS,
    FLEXIBLE_PERIOD,
    INTERVAL_DAYS,
}

data class HabitGoal(
    val targetMinor: Long,
    val period: PeriodType,
    val goalType: GoalType = GoalType.QUANTITY,
    val unit: MeasurementUnit? = null,
    val frequencyTarget: Int? = null,
) {
    init {
        require(targetMinor > 0) { "Target must be positive" }
        require(frequencyTarget == null || frequencyTarget > 0) { "Frequency target must be positive" }
    }
}

data class HabitSchedule(
    val mode: ScheduleMode = ScheduleMode.SELECTED_DAYS,
    val activeDays: Set<DayOfWeek> = DayOfWeek.entries.toSet(),
    val firstDayOfWeek: DayOfWeek = DayOfWeek.MONDAY,
    val intervalDays: Int = 2,
) {
    init {
        if (mode == ScheduleMode.SELECTED_DAYS) {
            require(activeDays.isNotEmpty()) { "At least one active day is required for SELECTED_DAYS" }
        }
        require(intervalDays >= 2) { "Interval must be at least two days" }
    }

    constructor(
        activeDays: Set<DayOfWeek>,
        firstDayOfWeek: DayOfWeek,
    ) : this(
        mode = ScheduleMode.SELECTED_DAYS,
        activeDays = activeDays,
        firstDayOfWeek = firstDayOfWeek,
        intervalDays = 2,
    )
}

data class HabitDefinition(
    val id: String,
    val name: String = "",
    val description: String? = null,
    val iconId: String? = null,
    val colorArgb: Int? = null,
    val active: Boolean = true,
    val startsOn: LocalDate = LocalDate.of(1970, 1, 1),
    val archived: Boolean = false,
    val sortOrder: Int = 0,
    val updatedAtEpochMs: Long = 0L,
    val goal: HabitGoal,
    val schedule: HabitSchedule,
) {
    constructor(
        id: String,
        active: Boolean,
        goal: HabitGoal,
        schedule: HabitSchedule,
    ) : this(
        id = id,
        name = "",
        description = null,
        iconId = null,
        colorArgb = null,
        active = active,
        startsOn = LocalDate.of(1970, 1, 1),
        archived = false,
        sortOrder = 0,
        updatedAtEpochMs = 0L,
        goal = goal,
        schedule = schedule,
    )
}

data class HabitEntry(
    val id: String,
    val habitId: String,
    val occurredAt: Instant,
    val localDate: LocalDate,
    val observedZoneId: ZoneId,
    val valueMinor: Long,
    val sessionId: String? = null,
    val note: String? = null,
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
