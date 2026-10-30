package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.calendar.CalendarEvent
import ch.nicolab.cadence.calendar.localEnd
import ch.nicolab.cadence.calendar.localStart
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/**
 * Photo de la planification d'un jour : ce qui est occupé, la charge, et ce qu'il reste à placer.
 *
 * Les événements de l'agenda, les plages protégées et les tâches à heure fixe bloquent le temps ;
 * les tâches sans heure sont les [toPlace].
 */
data class DayPlan(
    val day: LocalDate,
    val workday: Boolean,
    val capacity: Capacity,
    val toPlace: List<TaskItem>,
    private val hours: WorkingHours,
    private val busy: List<Slot>,
    private val notBefore: Int,
) {
    /** Propose un créneau à [tasks] (par défaut, toutes celles qui n'ont pas d'heure). */
    fun propose(tasks: List<TaskItem> = toPlace): Placement =
        DayPlanner.place(day, hours, busy, tasks.map(DayPlans::candidate), notBefore)
}

object DayPlans {
    fun candidate(task: TaskItem) = Candidate(task.uid, task.estimatedMinutes, task.dueDay, task.priority)

    /**
     * @param dayTasks tâches ouvertes prévues ce jour-là ; [notBefore] est l'heure courante en minutes
     * quand [day] est aujourd'hui, sinon 0.
     */
    fun of(
        day: LocalDate,
        zone: ZoneId,
        settings: PlanningSettings,
        events: List<CalendarEvent>,
        dayTasks: List<TaskItem>,
        notBefore: Int = 0,
    ): DayPlan {
        val hours = settings.hours
        val external = eventSlots(day, zone, events) + focusSlots(day, settings)
        val timed = timedTaskSlots(day, zone, dayTasks)
        val available = DayPlanner.availableMinutes(day, hours, external, notBefore)
        val planned = dayTasks.sumOf { it.estimatedMinutes?.takeIf { m -> m > 0 } ?: DayPlanner.DEFAULT_ESTIMATE_MINUTES }
        return DayPlan(
            day = day,
            workday = hours.isWorkday(day),
            capacity = Capacity(planned, available),
            toPlace = dayTasks.filterNot { it.dueHasTime },
            hours = hours,
            busy = external + timed,
            notBefore = notBefore,
        )
    }

    /** Événements à heure du jour ; une journée entière n'occupe pas d'heure précise. */
    fun eventSlots(day: LocalDate, zone: ZoneId, events: List<CalendarEvent>): List<Slot> {
        val dayStart = day.atStartOfDay(zone).toInstant().toEpochMilli()
        return events.filterNot { it.allDay }.mapNotNull { event ->
            clip(event.localStart(zone), event.localEnd(zone), dayStart)
        }
    }

    fun focusSlots(day: LocalDate, settings: PlanningSettings): List<Slot> =
        settings.focusBlocks.filter { day.dayOfWeek in it.days }.map { it.slot }

    /** Une tâche à heure fixe occupe son estimation à partir de cette heure. */
    fun timedTaskSlots(day: LocalDate, zone: ZoneId, tasks: List<TaskItem>): List<Slot> {
        val dayStart = day.atStartOfDay(zone).toInstant().toEpochMilli()
        return tasks.mapNotNull { task ->
            val due = task.dueDate?.takeIf { task.dueHasTime } ?: return@mapNotNull null
            val length = task.estimatedMinutes?.takeIf { it > 0 } ?: DayPlanner.DEFAULT_ESTIMATE_MINUTES
            val start = due.toEpochMilli()
            clip(start, start + length * MILLIS_PER_MINUTE, dayStart)
        }
    }

    /** Heure courante en minutes depuis minuit, ou 0 pour un autre jour. */
    fun notBefore(day: LocalDate, now: Instant, zone: ZoneId): Int {
        val local = now.atZone(zone)
        return if (local.toLocalDate() == day) local.toLocalTime().toSecondOfDay() / 60 else 0
    }

    private fun clip(startMillis: Long, endMillis: Long, dayStartMillis: Long): Slot? {
        val start = ((startMillis - dayStartMillis) / MILLIS_PER_MINUTE).coerceIn(0, MINUTES_PER_DAY.toLong()).toInt()
        val end = ((endMillis - dayStartMillis) / MILLIS_PER_MINUTE).coerceIn(0, MINUTES_PER_DAY.toLong()).toInt()
        return if (end > start) Slot(start, end) else null
    }

    private const val MILLIS_PER_MINUTE = 60_000L
    private const val MINUTES_PER_DAY = 24 * 60
}

/** Quand proposer quoi : la carte du matin, celle du soir, et l'état « bouclée ». */
object DayRhythm {
    /**
     * « Planifier la journée » se propose les jours travaillés, avant l'heure de fin de journée,
     * tant qu'elle n'a pas été écartée et qu'il y a un retard à trier ou des tâches à placer.
     */
    fun morningCardVisible(
        settings: PlanningSettings,
        today: LocalDate,
        now: LocalTime,
        dismissedDay: LocalDate?,
        overdueCount: Int,
        toPlaceCount: Int,
    ): Boolean =
        settings.hours.isWorkday(today) &&
            now.isBefore(settings.shutdown) &&
            dismissedDay != today &&
            (overdueCount > 0 || toPlaceCount > 0)

    /** « Terminer la journée » apparaît à l'heure choisie, une fois par jour, s'il reste quelque chose à dire. */
    fun eveningCardVisible(
        settings: PlanningSettings,
        today: LocalDate,
        now: LocalTime,
        closedDay: LocalDate?,
        doneCount: Int,
        unfinishedCount: Int,
    ): Boolean =
        !now.isBefore(settings.shutdown) &&
            closedDay != today &&
            (doneCount > 0 || unfinishedCount > 0)
}
