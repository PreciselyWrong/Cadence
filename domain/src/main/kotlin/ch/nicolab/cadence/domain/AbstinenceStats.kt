package ch.nicolab.cadence.domain

import java.time.LocalDate

enum class AbstinenceProfile {
    NONE, ALCOHOL, MASTURBATION, SMOKING, VAPING, CANNABIS, CAFFEINE,
    GAMBLING, SOCIAL_MEDIA, BEDTIME_SCREENS, IMPULSE_SHOPPING, PORNOGRAPHY, CUSTOM,
}

data class AbstinenceStats(
    val currentDays: Long,
    val bestDays: Long,
    val observedDays30: Int,
    val clearDays30: Int,
    val occurrenceDays30: Int,
    val occurrences30: Int,
    val todayHasOccurrence: Boolean,
    val isPaused: Boolean,
    val averageClearDaysBetweenOccurrences: Double?,
    val observedDays90: Int,
    val clearDays90: Int,
    val occurrenceDays90: Int,
    val occurrences90: Int,
)

/** No entry means no recorded occurrence, never a physiological measurement. */
object AbstinenceStatsCalculator {
    fun compute(
        habitId: String,
        startsOn: LocalDate,
        today: LocalDate,
        entries: List<HabitEntry>,
        pauses: List<HabitPause>,
    ): AbstinenceStats {
        val start = minOf(startsOn.toEpochDay(), today.toEpochDay())
        val end = today.toEpochDay()
        val relevant = entries.filter { it.habitId == habitId && it.localDate >= startsOn && it.localDate <= today }
        val todayHasOccurrence = relevant.any { it.localDate == today }
        val paused = today >= startsOn && pauses.any { it.includes(today) }
        val pauseRanges = merge(pauses.mapNotNull {
            val from = maxOf(start, it.start.toEpochDay())
            val to = minOf(end, it.endExclusive?.toEpochDay() ?: end)
            if (from < to) from until to else null
        })
        val occurrenceDays = relevant.asSequence().map { it.localDate.toEpochDay() }.filter { it < end }.toSet()
        val blocked = merge(pauseRanges + occurrenceDays.map { it..it })
        var cursor = start
        var best = 0L
        for (range in blocked) {
            best = maxOf(best, range.first - cursor)
            cursor = range.last + 1
        }
        best = maxOf(best, end - cursor)
        val current = if (todayHasOccurrence || paused) 0L else end - cursor
        val recent30 = window(maxOf(start, end - 30), end, relevant, pauseRanges)
        val recent90 = window(maxOf(start, end - 90), end, relevant, pauseRanges)
        val frequencyStart = maxOf(start, end - 89)
        val frequencyDates = relevant.asSequence()
            .map { it.localDate }
            .filter { it.toEpochDay() >= frequencyStart && !pauses.any { pause -> pause.includes(it) } }
            .distinct()
            .sorted()
            .toList()
        val intervals = frequencyDates.zipWithNext().mapNotNull { (from, to) ->
            if (pauses.any { pause ->
                    pause.start < to && (pause.endExclusive == null || pause.endExclusive > from.plusDays(1))
                }) null
            else to.toEpochDay() - from.toEpochDay()
        }
        val averageClearDays = intervals.takeIf { it.isNotEmpty() }?.map { it - 1.0 }?.average()
        return AbstinenceStats(current, best, recent30.observedDays, recent30.clearDays,
            recent30.occurrenceDays, recent30.occurrences, todayHasOccurrence, paused,
            averageClearDays, recent90.observedDays, recent90.clearDays,
            recent90.occurrenceDays, recent90.occurrences)
    }

    private data class WindowCounts(val observedDays: Int, val occurrenceDays: Int, val occurrences: Int) {
        val clearDays: Int get() = observedDays - occurrenceDays
    }

    private fun window(from: Long, end: Long, entries: List<HabitEntry>, pauseRanges: List<LongRange>): WindowCounts {
        val pausedDays = pauseRanges.sumOf { range ->
            (minOf(end, range.last + 1) - maxOf(from, range.first)).coerceAtLeast(0)
        }.toInt()
        val windowEntries = entries.filter { entry ->
            val day = entry.localDate.toEpochDay()
            day >= from && day < end && !contains(pauseRanges, day)
        }
        return WindowCounts((end - from).toInt() - pausedDays,
            windowEntries.map(HabitEntry::localDate).toSet().size, windowEntries.size)
    }

    private fun contains(ranges: List<LongRange>, day: Long): Boolean {
        var low = 0
        var high = ranges.lastIndex
        while (low <= high) {
            val mid = (low + high) ushr 1
            val range = ranges[mid]
            when {
                day < range.first -> high = mid - 1
                day > range.last -> low = mid + 1
                else -> return true
            }
        }
        return false
    }

    private fun merge(ranges: List<LongRange>): List<LongRange> {
        val result = mutableListOf<LongRange>()
        for (range in ranges.sortedBy { it.first }) {
            val previous = result.lastOrNull()
            if (previous != null && range.first <= previous.last + 1) {
                result[result.lastIndex] = previous.first..maxOf(previous.last, range.last)
            } else result += range
        }
        return result
    }
}
