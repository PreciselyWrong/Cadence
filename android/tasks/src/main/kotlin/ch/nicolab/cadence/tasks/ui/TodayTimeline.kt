package ch.nicolab.cadence.tasks.ui

import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.calendar.localEnd
import ch.nicolab.cadence.calendar.localStart
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.planning.ProposedBlock
import java.time.Instant
import java.time.ZoneId

/** Une tâche d'« À caser » ; [missedAt] : l'heure passée sans qu'elle soit faite (« prévue 10:30 »), sinon null. */
data class ToPlace(val task: TaskItem, val missedAt: Instant? = null)

/** « Ma journée » coupée pour l'écran : [shown] d'emblée, [past] et [later] repliés. */
data class TimelineSplit(
    val shown: List<TimelineEntry>,
    val past: List<TimelineEntry.Item>,
    val later: List<TimelineEntry.Item>,
)

/** Une ligne de « Ma journée ». */
sealed interface TimelineEntry {
    /**
     * Une tâche à heure ou un événement. [past] : terminé (ou coché) avant maintenant, montré atténué ; [next] : la
     * prochaine chose à venir ; [overlaps] : commence avant la fin d'un élément précédent (« en même temps »).
     */
    data class Item(
        val item: TodayItem,
        val start: Instant?,
        val end: Instant?,
        val past: Boolean = false,
        val next: Boolean = false,
        val overlaps: Boolean = false,
    ) : TimelineEntry

    /** Le trait « maintenant ». */
    data object Now : TimelineEntry

    /** Temps libre entre maintenant (ou la fin de ce qui est en cours) et le prochain élément, en minutes du jour. */
    data class Free(val startMinute: Int, val endMinute: Int) : TimelineEntry {
        val minutes: Int get() = endMinute - startMinute
    }
}

/**
 * Aujourd'hui en ligne du temps (`docs/fork/ANDROID-UX-NOTES.md`, « Ligne du temps compacte ») : [toPlace] réunit ce
 * qui n'a pas d'heure et ce dont l'heure est passée sans être fait (celles-ci d'abord, rien ne disparaît) ; [entries]
 * déroule la journée : journée entière en tête, puis le passé, le trait maintenant, le créneau libre et la suite.
 */
data class TodayTimeline(val toPlace: List<ToPlace>, val entries: List<TimelineEntry>) {
    companion object {
        /** Un créneau plus court ne vaut pas d'être montré. */
        const val MIN_FREE_MINUTES = 30
        /** Durée d'une tâche sans estimation, pour le chevauchement et « Caser ici ». */
        const val DEFAULT_TASK_MINUTES = 30
        private const val QUARTER = 15
        /** Tâches d'« À caser » visibles ; les autres attendent repliées derrière « N autres ». */
        const val TO_PLACE_SHOWN = 3

        /** « À caser » : les [TO_PLACE_SHOWN] premières (les manquées d'abord) et le reste, replié. */
        fun splitToPlace(toPlace: List<ToPlace>): Pair<List<ToPlace>, List<ToPlace>> =
            toPlace.take(TO_PLACE_SHOWN) to toPlace.drop(TO_PLACE_SHOWN)

        /** Éléments à venir montrés dans « Ma journée » ; la suite attend repliée derrière « Ensuite · N ». */
        const val UPCOMING_SHOWN = 5

        /**
         * Ce que « Ma journée » montre d'emblée : la journée entière, ce qui est en cours, le trait maintenant, le
         * créneau libre et les [UPCOMING_SHOWN] prochains éléments. Le passé (fini ou coché) et la suite sont repliés.
         */
        fun split(entries: List<TimelineEntry>): TimelineSplit {
            val nowIndex = entries.indexOf(TimelineEntry.Now).takeIf { it >= 0 } ?: entries.size
            val before = entries.take(nowIndex)
            val after = entries.drop(nowIndex)
            val past = before.filterIsInstance<TimelineEntry.Item>().filter { it.past && it.start != null }
            val upcoming = after.filterIsInstance<TimelineEntry.Item>()
            val later = upcoming.drop(UPCOMING_SHOWN)
            val hidden = (past + later).toSet()
            return TimelineSplit(entries.filterNot { it in hidden }, past, later)
        }

        /** Demain et les suggestions ne s'affichent qu'une fois la journée vide : Aujourd'hui ne parle que d'aujourd'hui. */
        fun showsWhatsNext(openToday: Int): Boolean = openToday == 0

        fun of(
            tasks: List<TaskItem>,
            events: List<EventWithDone>,
            planStarts: Map<String, Instant>,
            planOrder: List<String>,
            now: Instant,
            zone: ZoneId,
        ): TodayTimeline {
            fun TaskItem.start(): Instant? = planStarts[uid] ?: dueDate?.takeIf { dueHasTime }
            fun TaskItem.end(): Instant = start()!!.plusSeconds(60L * (estimatedMinutes?.takeIf { it > 0 } ?: DEFAULT_TASK_MINUTES))
            val (timed, untimed) = tasks.partition { it.start() != null }
            // Manquée une fois sa durée écoulée sans être faite ; en cours, elle reste sur la journée.
            val (missed, upcoming) = timed.partition { !it.end().isAfter(now) }
            val orderedUntimed = mergeTodayItems(untimed, emptyList(), zone, planStarts, planOrder)
                .filterIsInstance<TodayItem.Task>().map { it.task }
            val toPlace = missed.sortedBy { it.start() }.map { ToPlace(it, it.start()) } + orderedUntimed.map { ToPlace(it) }

            val allDay = events.filter { it.event.allDay }.map { TimelineEntry.Item(TodayItem.Event(it), null, null) }
            val dated = upcoming.map { task ->
                val start = task.start()!!
                TimelineEntry.Item(TodayItem.Task(task), start, task.end())
            } + events.filterNot { it.event.allDay }.map {
                val start = Instant.ofEpochMilli(it.event.localStart(zone))
                val end = Instant.ofEpochMilli(it.event.localEnd(zone))
                TimelineEntry.Item(TodayItem.Event(it), start, end, past = it.done || !end.isAfter(now))
            }
            // Ordre des heures ; à heure égale l'événement d'abord. Seule une tâche qui tombe pendant un événement est
            // « en même temps » : deux événements ou deux tâches qui se touchent ne disent rien d'utile.
            var eventEnd: Instant? = null
            val sorted = dated.sortedWith(compareBy<TimelineEntry.Item> { it.start }.thenBy { it.item is TodayItem.Task })
                .map { entry ->
                    if (entry.item is TodayItem.Event) {
                        if (eventEnd == null || entry.end!!.isAfter(eventEnd)) eventEnd = entry.end
                        entry
                    } else {
                        entry.copy(overlaps = eventEnd?.let { entry.start!!.isBefore(it) } == true)
                    }
                }
            // Avant le trait : ce qui a commencé (passé ou en cours) ; après : ce qui commence plus tard.
            val (before, after) = sorted.partition { !it.start!!.isAfter(now) }
            val nextIndex = after.indexOfFirst { !it.past }
            val later = after.mapIndexed { i, entry -> entry.copy(next = i == nextIndex) }

            val ongoingEnd = before.filterNot { it.past }.maxOfOrNull { it.end!! }
            val freeFrom = listOfNotNull(now, ongoingEnd).max()
            val freeTo = later.firstOrNull()?.start
            val free = if (freeTo != null) {
                val from = minuteOfDay(freeFrom, zone)
                val to = minuteOfDay(freeTo, zone)
                TimelineEntry.Free(from, to).takeIf { it.minutes >= MIN_FREE_MINUTES }
            } else {
                null
            }
            return TodayTimeline(toPlace, allDay + before + TimelineEntry.Now + listOfNotNull(free) + later)
        }

        /**
         * « Caser ici » : les tâches [tasks] à la suite, dans leur ordre, dès le quart d'heure qui suit le début du
         * créneau [free] ; une tâche qui ne tient plus est sautée, la suivante peut encore tenir.
         */
        fun fill(tasks: List<TaskItem>, free: TimelineEntry.Free): List<ProposedBlock> {
            var cursor = (free.startMinute + QUARTER - 1) / QUARTER * QUARTER
            return tasks.mapNotNull { task ->
                val minutes = task.estimatedMinutes?.takeIf { it > 0 } ?: DEFAULT_TASK_MINUTES
                if (cursor + minutes > free.endMinute) {
                    null
                } else {
                    ProposedBlock(task.uid, cursor, cursor + minutes).also { cursor += minutes }
                }
            }
        }

        private fun minuteOfDay(instant: Instant, zone: ZoneId): Int =
            instant.atZone(zone).toLocalTime().let { it.hour * 60 + it.minute }
    }
}
