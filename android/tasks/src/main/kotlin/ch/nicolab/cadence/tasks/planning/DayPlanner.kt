package ch.nicolab.cadence.tasks.planning

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime

/** Plage `[start, end[` en minutes depuis minuit, dans le fuseau de l'appareil. */
data class Slot(val start: Int, val end: Int) {
    init {
        require(end >= start) { "end < start" }
    }

    val minutes: Int get() = end - start
}

/** Heures de travail : seuls ces jours et cette fenêtre reçoivent des propositions. */
data class WorkingHours(
    val start: LocalTime = LocalTime.of(9, 0),
    val end: LocalTime = LocalTime.of(18, 0),
    val days: Set<DayOfWeek> = DEFAULT_DAYS,
) {
    val startMinute: Int get() = start.toSecondOfDay() / 60
    val endMinute: Int get() = end.toSecondOfDay() / 60

    fun isWorkday(date: LocalDate): Boolean = date.dayOfWeek in days && endMinute > startMinute

    companion object {
        val DEFAULT_DAYS: Set<DayOfWeek> = setOf(
            DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY,
        )
    }
}

/** Tâche à placer : l'ordre vient de l'échéance puis de la priorité, jamais du hasard. */
data class Candidate(
    val uid: String,
    val estimateMinutes: Int?,
    val dueDay: LocalDate?,
    val priority: Int?,
)

data class ProposedBlock(val uid: String, val start: Int, val end: Int)

/** [unplaced] : ce qui ne tient pas dans la journée, à reporter ou à raccourcir. */
data class Placement(val blocks: List<ProposedBlock>, val unplaced: List<String>)

/** Charge d'une journée : minutes planifiées contre minutes disponibles. */
data class Capacity(val plannedMinutes: Int, val availableMinutes: Int) {
    val freeMinutes: Int get() = (availableMinutes - plannedMinutes).coerceAtLeast(0)

    /** Vrai dès que la charge atteint 100 % de ce qui est disponible. */
    val overloaded: Boolean get() = plannedMinutes > 0 && plannedMinutes >= availableMinutes

    /** Part du disponible déjà planifiée, bornée à 1 pour la jauge. */
    val fill: Float
        get() = when {
            plannedMinutes <= 0 -> 0f
            availableMinutes <= 0 -> 1f
            else -> (plannedMinutes.toFloat() / availableMinutes).coerceAtMost(1f)
        }
}

/**
 * Planificateur déterministe : premier créneau libre, dans l'ordre échéance puis priorité.
 * Aucune IA ; mêmes entrées, mêmes propositions. Un créneau ne chevauche jamais un événement
 * ni une autre proposition, et garde une marge de [BUFFER_MINUTES] de chaque côté.
 */
object DayPlanner {
    const val DEFAULT_ESTIMATE_MINUTES = 30
    const val BUFFER_MINUTES = 15
    const val STEP_MINUTES = 5

    fun place(
        day: LocalDate,
        hours: WorkingHours,
        busy: List<Slot>,
        candidates: List<Candidate>,
        notBefore: Int = 0,
        bufferMinutes: Int = BUFFER_MINUTES,
    ): Placement {
        if (!hours.isWorkday(day)) return Placement(emptyList(), candidates.map { it.uid }.sorted())
        val windowStart = maxOf(hours.startMinute, notBefore)
        val windowEnd = hours.endMinute
        val occupied = busy.filter { it.minutes > 0 }.toMutableList()
        val blocks = mutableListOf<ProposedBlock>()
        val unplaced = mutableListOf<String>()
        for (candidate in candidates.sortedWith(ORDER)) {
            val length = candidate.estimateMinutes?.takeIf { it > 0 } ?: DEFAULT_ESTIMATE_MINUTES
            var start = roundUp(windowStart)
            while (true) {
                val clash = occupied.firstOrNull { start < it.end + bufferMinutes && start + length + bufferMinutes > it.start }
                    ?: break
                start = roundUp(clash.end + bufferMinutes)
            }
            if (start + length <= windowEnd) {
                blocks += ProposedBlock(candidate.uid, start, start + length)
                occupied += Slot(start, start + length)
            } else {
                unplaced += candidate.uid
            }
        }
        return Placement(blocks.sortedBy { it.start }, unplaced)
    }

    /** Minutes de travail encore libres : fenêtre à partir de [notBefore], moins l'union des plages occupées. */
    fun availableMinutes(day: LocalDate, hours: WorkingHours, busy: List<Slot>, notBefore: Int = 0): Int {
        if (!hours.isWorkday(day)) return 0
        val from = maxOf(hours.startMinute, notBefore)
        val to = hours.endMinute
        if (to <= from) return 0
        var taken = 0
        var cursor = from
        for (slot in busy.sortedBy { it.start }) {
            val start = maxOf(slot.start, cursor)
            val end = minOf(slot.end, to)
            if (end > start) {
                taken += end - start
                cursor = end
            }
        }
        return (to - from) - taken
    }

    private fun roundUp(minute: Int): Int = (minute + STEP_MINUTES - 1) / STEP_MINUTES * STEP_MINUTES

    private val ORDER: Comparator<Candidate> =
        compareBy<Candidate> { it.dueDay == null }
            .thenBy { it.dueDay }
            .thenByDescending { it.priority ?: -1 }
            .thenBy { it.uid }
}

/** « 3 h 20 », « 4 h », « 45 min ». */
fun formatMinutes(minutes: Int): String {
    val total = minutes.coerceAtLeast(0)
    val hours = total / 60
    val rest = total % 60
    return when {
        hours == 0 -> "$rest min"
        rest == 0 -> "$hours h"
        else -> "$hours h ${rest.toString().padStart(2, '0')}"
    }
}
