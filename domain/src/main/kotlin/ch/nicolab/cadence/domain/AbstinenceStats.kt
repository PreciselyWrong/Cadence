package ch.nicolab.cadence.domain

import java.time.LocalDate

enum class AbstinenceProfile { NONE, ALCOHOL, MASTURBATION, SMOKING, VAPING, CANNABIS, CAFFEINE, CUSTOM }

data class AbstinenceStats(
    val currentDays: Long,
    val bestDays: Long,
    val observedDays30: Int,
    val clearDays30: Int,
    val occurrenceDays30: Int,
    val occurrences30: Int,
    val todayHasOccurrence: Boolean,
    val isPaused: Boolean,
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
        val windowStart = maxOf(start, end - 30)
        val pausedDays = pauseRanges.sumOf { range ->
            (minOf(end, range.last + 1) - maxOf(windowStart, range.first)).coerceAtLeast(0)
        }.toInt()
        val windowEntries = relevant.filter { entry ->
            val day = entry.localDate.toEpochDay()
            day >= windowStart && day < end && !contains(pauseRanges, day)
        }
        val observed = (end - windowStart).toInt() - pausedDays
        val occurrenceDayCount = windowEntries.map { it.localDate }.toSet().size
        return AbstinenceStats(current, best, observed, observed - occurrenceDayCount,
            occurrenceDayCount, windowEntries.size, todayHasOccurrence, paused)
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
