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

/**
 * `targetMinor` est l'idéal, `minimumMinor` le seuil qui valide la période et la série.
 * Sans minimum explicite, les deux se confondent : un objectif hérité garde son sens.
 */
data class HabitGoal(
    val targetMinor: Long,
    val period: PeriodType,
    val goalType: GoalType = GoalType.QUANTITY,
    val unit: MeasurementUnit? = null,
    val frequencyTarget: Int? = null,
    val minimumMinor: Long? = null,
) {
    init {
        require(targetMinor > 0) { "Target must be positive" }
        require(frequencyTarget == null || frequencyTarget > 0) { "Frequency target must be positive" }
        minimumMinor?.let {
            require(it > 0) { "Minimum must be positive" }
            require(it <= targetMinor) { "Minimum cannot exceed the ideal" }
        }
    }

    val effectiveMinimumMinor: Long get() = minimumMinor ?: targetMinor

    /** Vrai lorsque le minimum et l'idéal se distinguent réellement. */
    val hasDistinctMinimum: Boolean get() = effectiveMinimumMinor < targetMinor
}

/** Ce qu'une période a atteint : rien, le minimum, ou l'idéal. */
enum class GoalAttainment {
    TODO,
    MINIMUM,
    IDEAL,
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
    val groupId: String = HabitGroup.ALL_DAY_ID,
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
        groupId = HabitGroup.ALL_DAY_ID,
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

/** Pourquoi une habitude est mise de côté. Aucune de ces raisons ne casse la série. */
enum class PauseReason {
    REST,
    ILLNESS,
    TRAVEL,
    CUSTOM,

    /** Pause ouverte décidée depuis les options de l'habitude, sans motif déclaré. */
    MANUAL,
    ;

    companion object {
        fun fromStorage(raw: String?): PauseReason? = entries.firstOrNull { it.name == raw }
    }
}

data class HabitPause(
    val start: LocalDate,
    val endExclusive: LocalDate?,
    val reason: PauseReason? = null,
    /** Formulation libre, réservée à [PauseReason.CUSTOM]. */
    val reasonLabel: String? = null,
) {
    init {
        require(endExclusive == null || endExclusive > start) { "Pause end must be after start" }
        if (reason == PauseReason.CUSTOM) {
            require(!reasonLabel.isNullOrBlank()) { "A custom reason needs its wording" }
        }
    }

    fun includes(date: LocalDate): Boolean = date >= start && (endExclusive == null || date < endExclusive)

    val isSingleDay: Boolean get() = endExclusive == start.plusDays(1)

    /** Un saut s'annule le jour même, pas après coup. */
    fun isCancellableOn(date: LocalDate): Boolean = isSingleDay && date == start

    /**
     * Reprise anticipée : la pause s'arrête au matin de [date]. Rendre `null` signifie que
     * la pause n'a plus lieu d'être — la reprise précède son premier jour.
     */
    fun resumedOn(date: LocalDate): HabitPause? = when {
        date <= start -> null
        endExclusive != null && date >= endExclusive -> this
        else -> copy(endExclusive = date)
    }

    companion object {
        fun skip(date: LocalDate, reason: PauseReason, label: String? = null) = HabitPause(
            start = date,
            endExclusive = date.plusDays(1),
            reason = reason,
            reasonLabel = label?.trim()?.ifBlank { null }.takeIf { reason == PauseReason.CUSTOM },
        )

        /** Voyage sur une plage inclusive : le dernier jour est encore suspendu. */
        fun travel(from: LocalDate, toInclusive: LocalDate): HabitPause {
            require(toInclusive >= from) { "Travel must end on or after its first day" }
            return HabitPause(from, toInclusive.plusDays(1), PauseReason.TRAVEL)
        }
    }
}
