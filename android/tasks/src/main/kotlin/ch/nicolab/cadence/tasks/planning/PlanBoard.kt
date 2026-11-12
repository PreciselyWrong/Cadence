package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskViews
import java.time.LocalDate
import java.time.ZoneId

/** Une carte de la page Planifier : la tâche, le jour où elle est posée, et sa ligne du plan si ce jour la prévoit. */
internal data class PlanCard(
    val task: TaskItem,
    val day: LocalDate,
    /** Ligne du plan de [day] ; null pour une tâche seulement due ce jour. */
    val line: PlanEntry?,
) {
    val planned: Boolean get() = line != null

    /** Minute de début : le créneau du plan, sinon l'heure d'une échéance horaire. */
    fun startMinute(zone: ZoneId): Int? = line?.startMinute
        ?: task.dueDate?.takeIf { task.dueHasTime }?.atZone(zone)?.toLocalTime()?.let { it.hour * 60 + it.minute }

    /** Durée montrée et comptée : celle de la ligne du plan, sinon l'estimation. */
    val minutes: Int? get() = line?.durationMinutes ?: task.estimatedMinutes
}

/** Un jour du tableau : cartes ouvertes (à heure d'abord, puis l'ordre du plan, puis les seulement dues), faites à part. */
internal data class PlanDay(val date: LocalDate, val open: List<PlanCard>, val done: List<PlanCard>) {
    /** Charge du jour : la durée des cartes ouvertes qui en ont une. */
    val minutes: Int get() = open.sumOf { it.minutes ?: 0 }
}

/** Les quatre horizons de la page Planifier, dans l'ordre de l'écran. */
internal enum class Horizon { WEEK, THIS_MONTH, NEXT_MONTH, SOMEDAY }

/** Horizons remplis ; [plannedThisWeek] : tâches prévues un jour de cette semaine, listées à part sous « Cette semaine ». */
internal data class PlanHorizons(
    val buckets: Map<Horizon, List<TaskItem>>,
    val plannedThisWeek: List<Pair<TaskItem, LocalDate>>,
) {
    fun of(uid: String): Horizon? = Horizon.entries.firstOrNull { key -> buckets[key].orEmpty().any { it.uid == uid } }
}

/**
 * Règles de la page Planifier (web : `frontend/components/Upcoming/`, `docs/03-upcoming-view.md`) : membres d'un jour,
 * horizons et écritures. Rien ici n'écrit l'échéance : un jour se change par le plan du jour, un horizon par
 * `week_of`, `month_of` ou `#someday`.
 */
internal object PlanBoard {
    const val DAYS = 14

    /**
     * Les jours [today] … [today] + [count] - 1. Membres d'un jour (comme le serveur, `docs/fork/DECISIONS.md`) : les
     * tâches prévues ce jour, plus celles dues ce jour ([dueByDay], occurrences à venir comprises) qui ne sont prévues
     * à aucun autre jour à partir d'aujourd'hui. [todayDue] : les tâches d'Aujourd'hui hors plan (échéance du jour, en
     * cours…), déjà calculées pour l'onglet Aujourd'hui. [tasks] : toutes les tâches, fermées comprises.
     */
    fun days(
        tasks: List<TaskItem>,
        plan: List<PlanEntry>,
        today: LocalDate,
        todayDue: List<TaskItem>,
        dueByDay: Map<LocalDate, List<TaskItem>>,
        zone: ZoneId,
        count: Int = DAYS,
    ): List<PlanDay> {
        val byUid = tasks.associateBy { it.uid }
        val ahead = plan.filterNot { it.day.isBefore(today) }
        return (0 until count).map { offset ->
            val day = today.plusDays(offset.toLong())
            val lines = ahead.filter { it.day == day }.distinctBy { it.uid }
            val plannedUids = lines.mapTo(HashSet()) { it.uid }
            val elsewhere = ahead.filter { it.day != day }.mapTo(HashSet()) { it.uid } - plannedUids
            val planned = lines.mapNotNull { line -> byUid[line.uid]?.let { PlanCard(it, day, line) } }
            val due = (if (day == today) todayDue else dueByDay[day].orEmpty())
                .filter { it.uid !in plannedUids && it.uid !in elsewhere && it.parentTaskUid == null }
                .distinctBy { it.rowKey }
                .map { PlanCard(it, day, null) }
            val closedDue = if (day == today) emptyList() else tasks.filter {
                it.isClosed && it.dueDay == day && it.uid !in plannedUids && it.uid !in elsewhere && it.parentTaskUid == null
            }.map { PlanCard(it, day, null) }
            val (done, open) = (planned + due).partition { it.task.isClosed }
            PlanDay(day, order(open, zone), done + closedDue)
        }
    }

    /** À heure d'abord (par heure), puis sans heure : celles du plan dans son ordre, puis les seulement dues. */
    private fun order(cards: List<PlanCard>, zone: ZoneId): List<PlanCard> {
        val (timed, anytime) = cards.partition { it.startMinute(zone) != null }
        return timed.sortedBy { it.startMinute(zone) } + anytime.filter { it.planned } + anytime.filterNot { it.planned }
    }

    /**
     * En retard : tâches ouvertes dont l'échéance est passée, sauf celles prévues aujourd'hui ou un jour suivant
     * (le plan les a déjà reprises). [overdue] : le retard de l'onglet Aujourd'hui.
     */
    fun overdue(overdue: List<TaskItem>, plan: List<PlanEntry>, today: LocalDate): List<TaskItem> {
        val ahead = ServerPlan.plannedFrom(plan, today)
        return overdue.filterNot { it.uid in ahead }
    }

    /**
     * Écritures pour poser [card] sur [to] (web : `columnDropWrites`). Une carte prévue avec un créneau prend le même
     * créneau sur [to], puis quitte son jour (une tâche prévue deux fois plutôt que nulle part si le retrait échoue) ;
     * une carte prévue sans heure déplace sa ligne ; une carte seulement due est ajoutée au plan de [to].
     */
    fun moveWrites(card: PlanCard, to: LocalDate): List<PlanEdit> {
        if (card.day == to && card.planned) return emptyList()
        val line = card.line
        val start = line?.startMinute
        return when {
            line != null && start != null -> listOf(
                SlotTask(to, card.task.uid, start, line.durationMinutes ?: card.task.estimatedMinutes ?: DEFAULT_MINUTES),
                RemoveTask(card.day, card.task.uid),
            )
            line != null -> listOf(MoveTask(card.day, card.task.uid, to))
            else -> listOf(AddTask(to, card.task.uid))
        }
    }

    /** Retirer [card] de son jour : sa ligne quitte le plan ; une carte seulement due n'a rien à retirer. */
    fun removeWrites(card: PlanCard): List<PlanEdit> =
        if (card.planned) listOf(RemoveTask(card.day, card.task.uid)) else emptyList()

    /**
     * Horizons (web : `bucketHorizons`), première règle qui s'applique à une tâche ouverte de premier niveau :
     * 1. `#someday` ; 2. un engagement qui tient encore : `week_of` de cette semaine, `month_of` de ce mois ou du
     * suivant ; 3. sa date, déduite et jamais écrite : sa première ligne du plan depuis le début de la semaine, sinon
     * son échéance à partir d'aujourd'hui (pas pour une série). Un jour de cette semaine donne Cette semaine (une tâche
     * prévue un jour de cette semaine est listée à part, [PlanHorizons.plannedThisWeek]), un jour suivant de ce mois Ce
     * mois-ci, un jour du mois suivant Mois prochain. Une semaine, un mois ou une échéance passés ne décident rien.
     */
    fun horizons(tasks: List<TaskItem>, plan: List<PlanEntry>, today: LocalDate, weekStart: LocalDate): PlanHorizons {
        val weekEnd = weekStart.plusDays(6)
        val thisMonth = today.withDayOfMonth(1)
        val nextMonth = thisMonth.plusMonths(1)
        val firstPlanned = HashMap<String, LocalDate>()
        plan.filterNot { it.day.isBefore(weekStart) }.forEach { line ->
            val known = firstPlanned[line.uid]
            if (known == null || line.day.isBefore(known)) firstPlanned[line.uid] = line.day
        }
        fun byDate(date: LocalDate): Horizon? = when {
            !date.isAfter(weekEnd) -> Horizon.WEEK
            date.withDayOfMonth(1) == thisMonth -> Horizon.THIS_MONTH
            date.withDayOfMonth(1) == nextMonth -> Horizon.NEXT_MONTH
            else -> null
        }
        val buckets = Horizon.entries.associateWith { mutableListOf<TaskItem>() }
        val open = tasks.filter { !it.isClosed && it.parentTaskUid == null && !it.virtual }
        open.forEach { task ->
            val key = when {
                task.someday -> Horizon.SOMEDAY
                task.weekOf == weekStart -> Horizon.WEEK
                task.monthOf == thisMonth -> Horizon.THIS_MONTH
                task.monthOf == nextMonth -> Horizon.NEXT_MONTH
                else -> {
                    val plannedOn = firstPlanned[task.uid]
                    if (plannedOn != null && !plannedOn.isAfter(weekEnd)) return@forEach
                    val due = task.dueDay?.takeIf { !task.isRecurring && !it.isBefore(today) }
                    (plannedOn ?: due)?.let(::byDate)
                }
            }
            key?.let { buckets.getValue(it).add(task) }
        }
        val inBuckets = buckets.values.flatten().mapTo(HashSet()) { it.uid }
        val byUid = open.associateBy { it.uid }
        val plannedThisWeek = plan
            .filter { !it.day.isBefore(weekStart) && !it.day.isAfter(weekEnd) }
            .sortedBy { it.day }
            .distinctBy { it.uid }
            .mapNotNull { line -> byUid[line.uid]?.takeIf { it.uid !in inBuckets }?.let { it to line.day } }
        return PlanHorizons(buckets, plannedThisWeek)
    }

    /**
     * Changement qui pose [task] dans [to] (web : `horizonPatch`), ou null s'il y est déjà ([from]). L'autre
     * engagement est retiré pour que la tâche arrive où elle est posée ; quitter « Un jour » retire l'étiquette.
     */
    fun horizonChange(task: TaskItem, from: Horizon?, to: Horizon, today: LocalDate, weekStart: LocalDate): TaskChange? {
        if (from == to) return null
        val leaveSomeday = if (from == Horizon.SOMEDAY) false else null
        val thisMonth = today.withDayOfMonth(1)
        val settled = TaskViews.whenSettled(task)
        return when (to) {
            Horizon.SOMEDAY -> TaskChange(later = true, needsWhen = settled)
            Horizon.WEEK -> TaskChange(weekOf = weekStart, clearMonth = true, later = leaveSomeday, needsWhen = settled)
            Horizon.THIS_MONTH -> TaskChange(monthOf = thisMonth, clearWeek = true, later = leaveSomeday, needsWhen = settled)
            Horizon.NEXT_MONTH -> TaskChange(monthOf = thisMonth.plusMonths(1), clearWeek = true, later = leaveSomeday, needsWhen = settled)
        }
    }

    private const val DEFAULT_MINUTES = 30
}
