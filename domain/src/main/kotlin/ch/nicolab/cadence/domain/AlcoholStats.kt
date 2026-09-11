package ch.nicolab.cadence.domain

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

data class AlcoholConsumption(
    val id: String,
    val habitId: String,
    val localDate: LocalDate,
    val observedZoneId: ZoneId,
    val standardDrinks: Int? = null,
    val followUpDate: LocalDate? = null,
    val followUpNotified: Boolean = false,
    val observedAt: Instant? = null,
) {
    init {
        require(standardDrinks == null || standardDrinks > 0) { "Standard drinks must be positive" }
        require(observedAt == null || observedAt.atZone(observedZoneId).toLocalDate() == localDate) {
            "Observed instant must match the civil date"
        }
    }
}

data class AlcoholRestPlan(
    val avoidThrough: LocalDate,
    val nextUnrestrictedOn: LocalDate,
) {
    init {
        require(nextUnrestrictedOn == avoidThrough.plusDays(1)) { "The unrestricted day follows the rest plan" }
    }
}

enum class AlcoholStatisticsDayStatus {
    CLEAR,
    DRINKING,
    PAUSED,
    UNOBSERVED,
    TODAY_CLEAR,
    TODAY_DRINKING,
}

data class AlcoholStatisticsDay(
    val date: LocalDate,
    val status: AlcoholStatisticsDayStatus,
    val standardDrinks: Int?,
)

data class AlcoholStats(
    val currentSoberDays: Long,
    val bestSoberDays: Long,
    val drinkingDays30: Int,
    val drinkingDays90: Int,
    val standardDrinks30: Int,
    val knownQuantityDays30: Int,
    /** Consumption days in the 30-day window, including quantities still unknown. */
    val quantityDays30: Int,
    val averageDaysBetweenDrinking: Double?,
    val averageSoberDaysBetweenDrinking: Double?,
    val exceedsUsualSoberGap: Boolean,
    val pendingQuantityDates: List<LocalDate>,
    val restPlan: AlcoholRestPlan?,
    val todayHasConsumption: Boolean,
    val isPaused: Boolean,
    val days: List<AlcoholStatisticsDay>,
)

/**
 * Temps suivi sans prétendre connaître l'heure d'une consommation datée.
 * Une saisie faite sur le moment conserve son heure exacte. Une saisie rétroactive sans
 * heure repart prudemment à la fin de sa journée civile.
 */
object AlcoholElapsedCalculator {
    fun calculate(
        habitId: String,
        declaredStart: Instant,
        consumptions: List<AlcoholConsumption>,
        now: Instant,
    ): AbstinenceElapsed {
        val activeStart = activeStart(habitId, declaredStart, consumptions)
        return if (activeStart >= now) AbstinenceElapsed.ZERO
        else AbstinenceElapsed.from(Duration.between(activeStart, now))
    }

    fun activeStart(
        habitId: String,
        declaredStart: Instant,
        consumptions: List<AlcoholConsumption>,
    ): Instant {
        val latestSafeBoundary = consumptions.asSequence()
            .filter { it.habitId == habitId }
            .map { consumption ->
                consumption.observedAt
                    ?: consumption.localDate.plusDays(1).atStartOfDay(consumption.observedZoneId).toInstant()
            }
            .maxOrNull()
        return if (latestSafeBoundary != null && latestSafeBoundary > declaredStart) latestSafeBoundary else declaredStart
    }
}

/** Local consumption tracking; it never estimates alcohol concentration or driving fitness. */
object AlcoholStatsCalculator {
    private const val CALENDAR_DAYS = 90L
    private const val RECENT_DAYS = 30L

    fun compute(
        habitId: String,
        startsOn: LocalDate,
        today: LocalDate,
        consumptions: List<AlcoholConsumption>,
        pauses: List<HabitPause>,
    ): AlcoholStats {
        val relevant = consumptions.filter {
            it.habitId == habitId && it.localDate >= startsOn && it.localDate <= today
        }
        val consumptionsByDay = relevant.groupBy { it.localDate }
        val activePauses = pauses.filter { it.endExclusive == null || it.endExclusive > startsOn }
        val isPaused = today >= startsOn && activePauses.any { it.includes(today) }
        val todayHasConsumption = !isPaused && consumptionsByDay.containsKey(today)
        val calendarStart = today.minusDays(CALENDAR_DAYS - 1)
        val days = generateSequence(calendarStart) { date -> date.plusDays(1).takeIf { it <= today } }
            .map { date -> calendarDay(date, startsOn, today, consumptionsByDay, activePauses) }
            .toList()

        val recent30Start = today.minusDays(RECENT_DAYS - 1)
        val recent90Start = calendarStart
        val recent30 = relevant.filter { it.localDate >= recent30Start && !pausedOn(it.localDate, activePauses) }
        val recent90 = relevant.filter { it.localDate >= recent90Start && !pausedOn(it.localDate, activePauses) }
        val drinkingDates90 = recent90.map { it.localDate }.toSortedSet()
        val drinkingDays30 = recent30.map { it.localDate }.toSet().size
        val quantityDays30 = drinkingDays30
        val knownQuantities30 = recent30.filter { it.standardDrinks != null }
        val intervals = drinkingDates90.zipWithNext().mapNotNull { (from, to) ->
            if (activePauses.any { pauseOverlaps(it, from.plusDays(1), to) }) null
            else to.toEpochDay() - from.toEpochDay()
        }
        val averageDays = intervals.takeIf { it.isNotEmpty() }?.average()
        val averageSoberDays = averageDays?.minus(1.0)
        val currentAndBest = soberRuns(startsOn, today, consumptionsByDay.keys, activePauses, todayHasConsumption, isPaused)
        return AlcoholStats(
            currentSoberDays = currentAndBest.first,
            bestSoberDays = currentAndBest.second,
            drinkingDays30 = drinkingDays30,
            drinkingDays90 = drinkingDates90.size,
            standardDrinks30 = knownQuantities30.sumOf { it.standardDrinks ?: 0 },
            knownQuantityDays30 = knownQuantities30.map { it.localDate }.toSet().size,
            quantityDays30 = quantityDays30,
            averageDaysBetweenDrinking = averageDays,
            averageSoberDaysBetweenDrinking = averageSoberDays,
            exceedsUsualSoberGap = averageSoberDays != null && currentAndBest.first > averageSoberDays,
            pendingQuantityDates = relevant.asSequence()
                .filter { it.standardDrinks == null && !pausedOn(it.localDate, activePauses) }
                .map { it.localDate }
                .distinct()
                .sorted()
                .toList(),
            restPlan = restPlan(today, relevant.filterNot { pausedOn(it.localDate, activePauses) }),
            todayHasConsumption = todayHasConsumption,
            isPaused = isPaused,
            days = days,
        )
    }

    fun restPlan(today: LocalDate, consumptions: List<AlcoholConsumption>): AlcoholRestPlan? {
        var avoidThrough: LocalDate? = null
        consumptions.asSequence()
            .filter { it.standardDrinks != null }
            .sortedBy(AlcoholConsumption::localDate)
            .forEach { consumption ->
                val planStart = maxOf(consumption.localDate, avoidThrough ?: consumption.localDate)
                avoidThrough = planStart.plusDays(requireNotNull(consumption.standardDrinks).toLong())
            }
        val activeEnd = avoidThrough?.takeIf { it >= today } ?: return null
        return AlcoholRestPlan(activeEnd, activeEnd.plusDays(1))
    }

    private fun calendarDay(
        date: LocalDate,
        startsOn: LocalDate,
        today: LocalDate,
        consumptionsByDay: Map<LocalDate, List<AlcoholConsumption>>,
        pauses: List<HabitPause>,
    ): AlcoholStatisticsDay {
        val consumption = consumptionsByDay[date]?.firstOrNull()
        val status = when {
            date < startsOn -> AlcoholStatisticsDayStatus.UNOBSERVED
            pausedOn(date, pauses) -> AlcoholStatisticsDayStatus.PAUSED
            date == today && consumption != null -> AlcoholStatisticsDayStatus.TODAY_DRINKING
            date == today -> AlcoholStatisticsDayStatus.TODAY_CLEAR
            consumption != null -> AlcoholStatisticsDayStatus.DRINKING
            else -> AlcoholStatisticsDayStatus.CLEAR
        }
        return AlcoholStatisticsDay(date, status, consumption?.standardDrinks)
    }

    private fun soberRuns(
        startsOn: LocalDate,
        today: LocalDate,
        consumptionDates: Set<LocalDate>,
        pauses: List<HabitPause>,
        todayHasConsumption: Boolean,
        isPaused: Boolean,
    ): Pair<Long, Long> {
        if (startsOn >= today) return 0L to 0L
        val start = startsOn.toEpochDay()
        val endExclusive = today.toEpochDay()
        val breaks = mutableListOf<LongRange>()
        consumptionDates.asSequence()
            .map { it.toEpochDay() }
            .filter { it in start until endExclusive && !pausedOn(LocalDate.ofEpochDay(it), pauses) }
            .forEach { breaks += it..it }
        pauses.forEach { pause ->
            val from = maxOf(start, pause.start.toEpochDay())
            val to = minOf(endExclusive, pause.endExclusive?.toEpochDay() ?: endExclusive)
            if (from < to) breaks += from until to
        }
        var cursor = start
        var best = 0L
        for (range in merge(breaks)) {
            best = maxOf(best, range.first - cursor)
            cursor = maxOf(cursor, range.last + 1)
        }
        best = maxOf(best, endExclusive - cursor)
        val current = if (todayHasConsumption || isPaused) 0L else endExclusive - cursor
        return current to best
    }

    private fun pausedOn(date: LocalDate, pauses: List<HabitPause>): Boolean = pauses.any { it.includes(date) }

    private fun pauseOverlaps(pause: HabitPause, fromInclusive: LocalDate, toExclusive: LocalDate): Boolean {
        if (fromInclusive >= toExclusive) return false
        return pause.start < toExclusive && (pause.endExclusive == null || pause.endExclusive > fromInclusive)
    }

    private fun merge(ranges: List<LongRange>): List<LongRange> {
        val merged = mutableListOf<LongRange>()
        ranges.sortedBy { it.first }.forEach { range ->
            val previous = merged.lastOrNull()
            if (previous != null && range.first <= previous.last + 1) {
                merged[merged.lastIndex] = previous.first..maxOf(previous.last, range.last)
            } else merged += range
        }
        return merged
    }
}
