package ch.nicolab.cadence.domain

import java.time.DayOfWeek
import java.time.LocalDate

/** Créneaux horaires lisibles, bornés sur l'heure locale observée lors de la saisie. */
enum class TimeSlot(val fromHour: Int, val toHourExclusive: Int) {
    MORNING(5, 11),
    MIDDAY(11, 14),
    AFTERNOON(14, 18),
    EVENING(18, 23),
    NIGHT(23, 5),
    ;

    companion object {
        fun of(hour: Int): TimeSlot = entries.first { slot ->
            if (slot.fromHour < slot.toHourExclusive) hour in slot.fromHour until slot.toHourExclusive
            else hour >= slot.fromHour || hour < slot.toHourExclusive
        }
    }
}

/**
 * Un jour de la fenêtre observée, avec l'objectif effectivement en vigueur ce jour-là.
 * `dailyGoal` distingue un objectif quotidien : ailleurs, compter des jours au minimum
 * ou à l'idéal n'aurait pas de sens.
 */
data class InsightDay(
    val date: LocalDate,
    val minimumMinor: Long,
    val targetMinor: Long,
    val planned: Boolean,
    val paused: Boolean,
    val dailyGoal: Boolean,
)

data class BestDayInsight(
    val day: DayOfWeek,
    val averageMinor: Long,
    val overallAverageMinor: Long,
)

data class BestSlotInsight(
    val slot: TimeSlot,
    val share: Double,
    val entryCount: Int,
)

/** `minimumDays` et `idealDays` restent nuls hors objectif quotidien. */
data class MonthMetrics(
    val quantityMinor: Long,
    val activeDays: Int,
    val consideredDays: Int,
    val minimumDays: Int?,
    val idealDays: Int?,
) {
    val regularity: Double get() = if (consideredDays == 0) 0.0 else activeDays.toDouble() / consideredDays
}

data class MonthComparison(
    val current: MonthMetrics,
    val previous: MonthMetrics,
)

data class HabitInsights(
    val bestDay: BestDayInsight? = null,
    val bestSlot: BestSlotInsight? = null,
    val monthComparison: MonthComparison? = null,
    val observedEntryCount: Int = 0,
)

object HabitInsightsCalculator {
    /** En deçà, aucune tendance n'est affirmée. */
    const val MIN_ENTRIES = 12

    /** Chaque jour de la semaine comparé doit avoir été observé au moins ce nombre de fois. */
    const val MIN_OCCURRENCES_PER_DAY = 3

    /** Le meilleur jour doit dépasser nettement la moyenne. */
    const val BEST_DAY_RATIO = 1.25

    /** Le meilleur créneau doit concentrer une part suffisante des saisies. */
    const val BEST_SLOT_SHARE = .35

    fun of(
        entries: List<HabitEntry>,
        today: LocalDate,
        days: List<InsightDay>,
    ): HabitInsights {
        val considered = days.filter { it.planned && !it.paused }.associateBy(InsightDay::date)
        val observed = entries.filter { it.localDate in considered }
        return HabitInsights(
            bestDay = bestDay(observed, considered),
            bestSlot = bestSlot(observed),
            monthComparison = monthComparison(entries, today, days),
            observedEntryCount = observed.size,
        )
    }

    private fun bestDay(
        entries: List<HabitEntry>,
        considered: Map<LocalDate, InsightDay>,
    ): BestDayInsight? {
        if (entries.size < MIN_ENTRIES) return null
        val daysByWeekday = considered.keys.groupBy(LocalDate::getDayOfWeek)
        val valuesByWeekday = entries.groupBy { it.localDate.dayOfWeek }
        val averages = daysByWeekday
            .filterValues { it.size >= MIN_OCCURRENCES_PER_DAY }
            .mapValues { (weekday, dates) ->
                valuesByWeekday[weekday].orEmpty().sumOf(HabitEntry::valueMinor).toDouble() / dates.size
            }
        if (averages.size < 2) return null
        val overall = entries.sumOf(HabitEntry::valueMinor).toDouble() / considered.size
        if (overall <= 0.0) return null
        val (day, average) = averages.maxBy { it.value }
        if (average < overall * BEST_DAY_RATIO) return null
        return BestDayInsight(day, average.toLong(), overall.toLong())
    }

    private fun bestSlot(entries: List<HabitEntry>): BestSlotInsight? {
        if (entries.size < MIN_ENTRIES) return null
        val counts = entries
            .groupingBy { TimeSlot.of(it.occurredAt.atZone(it.observedZoneId).hour) }
            .eachCount()
        val ranked = counts.entries.sortedByDescending { it.value }
        val top = ranked.first()
        if (ranked.size > 1 && ranked[1].value == top.value) return null
        val share = top.value.toDouble() / entries.size
        if (share < BEST_SLOT_SHARE) return null
        return BestSlotInsight(top.key, share, top.value)
    }

    private fun monthComparison(
        entries: List<HabitEntry>,
        today: LocalDate,
        days: List<InsightDay>,
    ): MonthComparison? {
        val earliest = days.minOfOrNull(InsightDay::date) ?: return null
        val previousMonth = today.minusMonths(1)
        val previousStart = previousMonth.withDayOfMonth(1)
        if (earliest > previousStart) return null
        // Le mois courant est incomplet : le précédent est tronqué au même jour du mois.
        val previousEnd = previousStart.withDayOfMonth(minOf(today.dayOfMonth, previousMonth.lengthOfMonth()))
        val current = metrics(entries, days, today.withDayOfMonth(1), today)
        val previous = metrics(entries, days, previousStart, previousEnd)
        if (current.consideredDays == 0 || previous.consideredDays == 0) return null
        return MonthComparison(current, previous)
    }

    private fun metrics(
        entries: List<HabitEntry>,
        days: List<InsightDay>,
        start: LocalDate,
        end: LocalDate,
    ): MonthMetrics {
        val considered = days.filter { it.date in start..end && it.planned && !it.paused }
        val valuesByDate = entries
            .filter { it.localDate in start..end }
            .groupBy(HabitEntry::localDate)
            .mapValues { (_, dayEntries) -> dayEntries.sumOf(HabitEntry::valueMinor) }
        val perDay = considered.map { day -> day to (valuesByDate[day.date] ?: 0L) }
        val daily = considered.isNotEmpty() && considered.all(InsightDay::dailyGoal)
        return MonthMetrics(
            quantityMinor = perDay.sumOf { (_, value) -> value },
            activeDays = perDay.count { (_, value) -> value > 0 },
            consideredDays = considered.size,
            minimumDays = if (daily) perDay.count { (day, value) -> value >= day.minimumMinor } else null,
            idealDays = if (daily) perDay.count { (day, value) -> value >= day.targetMinor } else null,
        )
    }
}
