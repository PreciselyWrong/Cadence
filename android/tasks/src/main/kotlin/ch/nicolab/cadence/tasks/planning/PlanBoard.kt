package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskViews
import java.time.Instant
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

/** Les horizons de la page Planifier, dans l'ordre de l'écran (web : `HORIZON_KEYS`). */
internal enum class Horizon { WEEK, NEXT_WEEK, THIS_MONTH, NEXT_MONTH, SOMEDAY }

/** Engagement lu sur une tâche : un horizon qui tient encore, ou une semaine ou un mois passés (« À replanifier »). */
internal sealed interface Commitment {
    data class Holds(val horizon: Horizon) : Commitment
    data object Stale : Commitment
}

/**
 * Section « À planifier » de Planifier : [stale] (« À replanifier », engagement passé), [week] (engagées cette
 * semaine sans jour), [month] (engagées ce mois sans jour cette semaine).
 */
internal data class ToSchedule(
    val stale: List<TaskItem> = emptyList(),
    val week: List<TaskItem> = emptyList(),
    val month: List<TaskItem> = emptyList(),
) {
    val isEmpty: Boolean get() = stale.isEmpty() && week.isEmpty() && month.isEmpty()
}

/** Écritures d'un horizon choisi depuis le choix de date : le changement de la tâche et les lignes du plan à retirer. */
internal data class HorizonWrites(val change: TaskChange, val plan: List<PlanEdit>)

/**
 * Une tâche créée par le « + » de Planifier (Inbox ou jour) : [draft] sans échéance, prévue [day] (à [startMinute]
 * si la saisie nomme une heure), ou à classer quand [day] est null.
 */
internal data class PlanAdd(val draft: TaskDraft, val day: LocalDate?, val startMinute: Int?) {
    /** Les écritures du plan pour la tâche créée [uid]. */
    fun edits(uid: String): List<PlanEdit> = when {
        day == null -> emptyList()
        startMinute != null -> listOf(SlotTask(day, uid, startMinute, PlanBoard.DEFAULT_MINUTES))
        else -> listOf(AddTask(day, uid))
    }
}

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

    /**
     * Une carte de Jours envoyée vers un horizon (web : `sendToHorizon`) : la tâche prend l'horizon ([horizonChange],
     * échéance jamais touchée) et sa ligne quitte le jour ([removeWrites] ; une carte seulement due n'en a pas). Null
     * quand il n'y a rien à écrire.
     */
    fun sendToHorizon(card: PlanCard, from: Horizon?, to: Horizon, today: LocalDate, weekStart: LocalDate): HorizonWrites? {
        val change = horizonChange(card.task, from, to, today, weekStart)
        val plan = removeWrites(card)
        if (change == null && plan.isEmpty()) return null
        return HorizonWrites(change ?: TaskChange(), plan)
    }

    /**
     * « + » de Planifier (web : `addToInbox`, `addTask`) : la saisie ne pose jamais d'échéance. Le jour qu'elle nomme,
     * sinon une heure seule (aujourd'hui), sinon [column] (le jour du « + », null pour l'Inbox) prévoit la tâche ;
     * sans jour elle reste dans « Tâches à classer », avec « Quand ? » si un projet ou une zone la range déjà.
     */
    fun planAdd(draft: TaskDraft, column: LocalDate?, today: LocalDate): PlanAdd {
        val start = draft.dueTime?.let { time ->
            runCatching { java.time.LocalTime.parse(time) }.getOrNull()?.let { it.hour * 60 + it.minute }
        }
        val day = draft.dueDate ?: (if (start != null) today else null) ?: column
        val filed = draft.projectUid != null || draft.areaUid != null
        return PlanAdd(
            draft = draft.copy(dueDate = null, dueTime = null, needsWhen = draft.needsWhen || (day == null && filed)),
            day = day,
            startMinute = start,
        )
    }

    /**
     * « Étaler sur 7 jours » (web : `spreadOverdue`, cas partagés `fixtures/plan/spread-overdue.json`). Tri : priorité
     * haute, moyenne, basse, aucune ; puis l'échéance la plus ancienne ; puis l'uid. Chaque tâche va au jour, de
     * [today] à [today] + 6, dont la charge est la plus faible (somme des durées estimées de [planned], 30 min sans
     * estimation positive), le plus tôt à égalité ; la charge du jour choisi grandit de la durée de la tâche. Rend les
     * paires (uid, jour) dans l'ordre de placement.
     */
    fun spread(overdue: List<TaskItem>, planned: Map<LocalDate, List<Int?>>, today: LocalDate): List<Pair<String, LocalDate>> {
        val days = (0 until SPREAD_DAYS).map { today.plusDays(it.toLong()) }
        val load = days.mapTo(ArrayList()) { day -> planned[day].orEmpty().sumOf(::spreadMinutes) }
        val rank = { task: TaskItem -> when (task.priority) { 2 -> 0; 1 -> 1; 0 -> 2; else -> 3 } }
        return overdue
            .sortedWith(compareBy<TaskItem>(rank).thenBy { it.dueDay ?: LocalDate.MAX }.thenBy { it.uid })
            .map { task ->
                val best = load.indices.minBy { load[it] }
                load[best] += spreadMinutes(task.estimatedMinutes)
                task.uid to days[best]
            }
    }

    /**
     * Écritures d'« Étaler sur 7 jours » sur la page : la charge d'un jour vient de ses lignes du plan (cartes prévues,
     * terminées comprises ; pas les seulement dues), avec la durée estimée de la tâche, comme le web. Les occurrences virtuelles
     * d'une série ne se prévoient pas ; une tâche n'est posée qu'une fois.
     */
    fun spreadWrites(overdue: List<TaskItem>, days: List<PlanDay>, today: LocalDate): List<PlanEdit> {
        val planned = days.associate { day -> day.date to (day.open + day.done).filter { it.planned }.map { it.task.estimatedMinutes } }
        val tasks = overdue.filterNot { it.virtual }.distinctBy { it.uid }
        return spread(tasks, planned, today).map { (uid, day) -> AddTask(day, uid) }
    }

    private fun spreadMinutes(minutes: Int?): Int = minutes?.takeIf { it > 0 } ?: DEFAULT_MINUTES

    /** Retirer [card] de son jour : sa ligne quitte le plan ; une carte seulement due n'a rien à retirer. */
    fun removeWrites(card: PlanCard): List<PlanEdit> =
        if (card.planned) listOf(RemoveTask(card.day, card.task.uid)) else emptyList()

    /**
     * Horizons (web : `bucketHorizons`), première règle qui s'applique à une tâche ouverte de premier niveau :
     * 1. `#someday` ; 2. un engagement qui tient encore : `week_of` de cette semaine ou de la suivante, `month_of` de
     * ce mois ou du suivant ; 3. sa date, déduite et jamais écrite : sa première ligne du plan depuis le début de la semaine, sinon
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
                task.weekOf == weekStart.plusDays(7) -> Horizon.NEXT_WEEK
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
            Horizon.NEXT_WEEK -> TaskChange(weekOf = weekStart.plusDays(7), clearMonth = true, later = leaveSomeday, needsWhen = settled)
            Horizon.THIS_MONTH -> TaskChange(monthOf = thisMonth, clearWeek = true, later = leaveSomeday, needsWhen = settled)
            Horizon.NEXT_MONTH -> TaskChange(monthOf = thisMonth.plusMonths(1), clearWeek = true, later = leaveSomeday, needsWhen = settled)
        }
    }

    /**
     * « À planifier » (sous l'Inbox, même règle que le web) sur les tâches ouvertes de premier niveau :
     * - « À replanifier » : non récurrente, sans `#someday`, `week_of` avant cette semaine ou `month_of` avant ce mois,
     *   que [horizons] ne place nulle part et sans ligne du plan aujourd'hui ou après ; ni échue (échéance avant
     *   aujourd'hui : elle est dans « Échues ») ni montrée par « Tâches à classer » de l'Inbox ([TaskViews.unsorted]) ;
     * - « Cette semaine » : `week_of` de cette semaine (et dans ce seau), sans ligne du plan un jour de cette semaine ;
     * - « Ce mois-ci » : `month_of` de ce mois (et dans ce seau), sans ligne du plan un jour de cette semaine.
     */
    fun toSchedule(
        tasks: List<TaskItem>,
        plan: List<PlanEntry>,
        today: LocalDate,
        weekStart: LocalDate,
        horizons: PlanHorizons,
        now: Instant,
    ): ToSchedule {
        val weekEnd = weekStart.plusDays(6)
        val thisMonth = today.withDayOfMonth(1)
        val ahead = ServerPlan.plannedFrom(plan, today)
        val thisWeek = plan.filter { !it.day.isBefore(weekStart) && !it.day.isAfter(weekEnd) }.mapTo(HashSet()) { it.uid }
        val placed = horizons.buckets.values.flatten().mapTo(HashSet()) { it.uid } + horizons.plannedThisWeek.map { it.first.uid }
        val open = tasks.filter { !it.isClosed && it.parentTaskUid == null && !it.virtual }
        val inInbox = TaskViews.unsorted(open, now, weekStart, thisMonth, ahead).mapTo(HashSet()) { it.uid }
        val stale = open.filter { task ->
            !task.isRecurring && !task.someday && task.uid !in placed && task.uid !in ahead &&
                task.uid !in inInbox && !TaskViews.isOverdue(task, today) &&
                (task.weekOf?.isBefore(weekStart) == true || task.monthOf?.isBefore(thisMonth) == true)
        }
        val week = horizons.buckets[Horizon.WEEK].orEmpty().filter { it.weekOf == weekStart && it.uid !in thisWeek }
        val month = horizons.buckets[Horizon.THIS_MONTH].orEmpty().filter { it.monthOf == thisMonth && it.uid !in thisWeek }
        return ToSchedule(stale, week, month)
    }

    /** « Retirer l'engagement » : efface la semaine et le mois posés ; null s'il n'y en a pas. */
    fun dropCommitment(task: TaskItem): TaskChange? =
        TaskChange(clearWeek = task.weekOf != null, clearMonth = task.monthOf != null).takeIf { it != TaskChange() }

    /** Engagement montré par le champ de date d'une tâche sans échéance (même ordre que [horizons]). */
    fun commitment(task: TaskItem, today: LocalDate, weekStart: LocalDate): Commitment? {
        val thisMonth = today.withDayOfMonth(1)
        return when {
            task.dueDay != null -> null
            task.someday -> Commitment.Holds(Horizon.SOMEDAY)
            task.weekOf == weekStart -> Commitment.Holds(Horizon.WEEK)
            task.weekOf == weekStart.plusDays(7) -> Commitment.Holds(Horizon.NEXT_WEEK)
            task.monthOf == thisMonth -> Commitment.Holds(Horizon.THIS_MONTH)
            task.monthOf == thisMonth.plusMonths(1) -> Commitment.Holds(Horizon.NEXT_MONTH)
            task.weekOf?.isBefore(weekStart) == true || task.monthOf?.isBefore(thisMonth) == true -> Commitment.Stale
            else -> null
        }
    }

    /** Un horizon remplace la date d'une tâche simple de premier niveau ; une série garde son échéance. */
    fun canTakeHorizon(task: TaskItem): Boolean = !task.isRecurring && task.parentTaskUid == null && !task.virtual

    /**
     * Horizon choisi dans le choix de date : écrit comme le menu « Planifier » ([horizonChange], l'autre engagement
     * retiré), vide l'échéance (heure comprise) et retire les lignes du plan de la tâche d'aujourd'hui et après.
     */
    fun horizonFromDate(task: TaskItem, to: Horizon, plan: List<PlanEntry>, today: LocalDate, weekStart: LocalDate): HorizonWrites {
        val from = if (task.someday) Horizon.SOMEDAY else null
        val base = horizonChange(task, from, to, today, weekStart) ?: TaskChange()
        val change = if (task.dueDay != null || task.dueDate != null) base.copy(clearDue = true) else base
        val lines = plan.filter { it.uid == task.uid && !it.day.isBefore(today) }
            .map { it.day }.distinct().sorted()
            .map { RemoveTask(it, task.uid) }
        return HorizonWrites(change, lines)
    }

    /** Une date précise choisie : la semaine, le mois et `#someday` posés sont retirés avec [change]. */
    fun withDatePicked(change: TaskChange, task: TaskItem): TaskChange = change.copy(
        clearWeek = change.clearWeek || task.weekOf != null,
        clearMonth = change.clearMonth || task.monthOf != null,
        later = if (task.someday) false else change.later,
    )

    const val DEFAULT_MINUTES = 30
    const val SPREAD_DAYS = 7
}
