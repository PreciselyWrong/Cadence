package ch.nicolab.cadence.domain

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

enum class AbstinenceLogKind { CHECK_IN, URGE }

data class AbstinenceLog(
    val id: String,
    val habitId: String,
    val occurredAt: Instant,
    val localDate: LocalDate,
    val observedZoneId: ZoneId,
    val kind: AbstinenceLogKind,
    val intensity: Int? = null,
    val note: String? = null,
) {
    init {
        require(id.isNotBlank() && habitId.isNotBlank()) { "Journal identifiers cannot be blank" }
        require(if (kind == AbstinenceLogKind.URGE) intensity in 1..5 else intensity == null) {
            "Only an urge has an intensity, from one to five"
        }
        require(note == null || note.length <= 500) { "Journal note cannot exceed 500 characters" }
    }
}

data class AbstinenceJournalSummary(
    val checkedInToday: Boolean,
    val checkInDays30: Int,
    val urgeCount30: Int,
    val strongUrges30: Int,
) {
    companion object {
        /** A check-in records reflection, independently of any occurrence on the same day. */
        @Suppress("UNUSED_PARAMETER")
        fun compute(
            habitId: String,
            startsOn: LocalDate,
            today: LocalDate,
            logs: List<AbstinenceLog>,
            entries: List<HabitEntry>,
        ): AbstinenceJournalSummary {
            val from = maxOf(startsOn, today.minusDays(29))
            val relevant = logs.filter { it.habitId == habitId && it.localDate in from..today }
            val checkIns = relevant.filter { it.kind == AbstinenceLogKind.CHECK_IN }
            val urges = relevant.filter { it.kind == AbstinenceLogKind.URGE }
            return AbstinenceJournalSummary(
                checkedInToday = checkIns.any { it.localDate == today },
                checkInDays30 = checkIns.map { it.localDate }.distinct().size,
                urgeCount30 = urges.size,
                strongUrges30 = urges.count { (it.intensity ?: 0) >= 4 },
            )
        }
    }
}
