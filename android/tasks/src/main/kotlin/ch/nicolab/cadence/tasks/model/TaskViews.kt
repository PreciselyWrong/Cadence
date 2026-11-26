package ch.nicolab.cadence.tasks.model

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Règles d'affichage partagées par les écrans et le widget, reprises de
 * Tududi : une tâche reportée (defer_until futur) n'apparaît nulle part, une
 * sous-tâche reste sous sa tâche parente.
 */
object TaskViews {
    private fun visibleNow(task: TaskItem, now: Instant) =
        task.parentTaskUid == null && !task.isClosed &&
            (task.deferUntil == null || !task.deferUntil.isAfter(now))

    /**
     * En retard, prévues aujourd'hui, ou en cours / planifiées / en attente. Une tâche mise de côté
     * (« Plus tard », `someday`) n'est jamais en retard : son échéance passée ne la ramène pas.
     */
    fun today(tasks: List<TaskItem>, today: LocalDate, now: Instant): List<TaskItem> =
        tasks.filter { task ->
            if (!visibleNow(task, now)) return@filter false
            val due = task.dueDay
            if (task.someday && due != null && due.isBefore(today)) return@filter false
            (due != null && !due.isAfter(today)) ||
                task.status == TaskStatus.IN_PROGRESS ||
                task.status == TaskStatus.PLANNED ||
                task.status == TaskStatus.WAITING
        }.sortedWith(todayOrder)

    /**
     * Suggestions du jour, comme le serveur (`getCandidates`, `daily-plan/service.js`), hors ce qu'Aujourd'hui montre
     * déjà, hors « Plus tard » et jamais une routine (elle vient le jour de son échéance) :
     * 1. la prochaine action choisie de chaque projet ([ProjectItem.nextTaskUid]), si elle est suggestible ;
     * 2. les tâches décidées pour la semaine [weekStart], 3. celles en vue : choisies par l'utilisateur, elles restent
     *    suggérées même si leur projet a choisi une autre action ou n'est pas en cours ;
     * 4. le reste : tâche ouverte (pas commencée ou en attente) sans projet, ou d'un projet en cours (réglage serveur par
     *    défaut), échéance dans [HORIZON_DAYS] jours au plus. Un projet qui a choisi sa prochaine action ne propose que
     *    celle-là.
     * Chaque groupe suit la priorité, un projet avant l'absence de projet, puis l'échéance proche ; à égalité, les
     * mises en vue récentes d'abord, sinon l'ordre du nom (l'appareil ne connaît pas la dernière modification d'une
     * tâche, que le serveur utilise ensuite). Le plafond ([MAX_SUGGESTIONS]) s'applique à l'écran, après Demain ([ch.nicolab.cadence.tasks.planning.PlanBoard.todayLater]).
     */
    fun suggestions(
        tasks: List<TaskItem>,
        today: LocalDate,
        now: Instant,
        weekStart: LocalDate,
        projects: List<ProjectItem> = emptyList(),
    ): List<TaskItem> {
        val shown = today(tasks, today, now).mapTo(hashSetOf()) { it.uid }
        val picks = NextAction.byProject(projects).filter { (project, uid) ->
            tasks.any { it.uid == uid && it.projectUid == project && !it.isClosed }
        }
        val active = projects.filter { it.projectStatus == ProjectStatus.IN_PROGRESS }.mapTo(hashSetOf()) { it.uid }
        val horizon = now.plus(Duration.ofDays(HORIZON_DAYS))
        val open = tasks.filter { visibleNow(it, now) && !it.someday && !it.isRecurring && it.uid !in shown }
        fun chosen(task: TaskItem) = task.weekOf == weekStart || task.inViewAt != null
        fun suggestible(task: TaskItem): Boolean =
            (task.status == TaskStatus.NOT_STARTED || task.status == TaskStatus.WAITING) &&
                task.dueDate?.isAfter(horizon) != true &&
                if (task.projectUid == null) true
                else task.projectUid in active && (task.projectUid !in picks || picks[task.projectUid] == task.uid)
        val rest = open.filterNot(::chosen).filter(::suggestible)
        val designated = rest.filter { it.projectUid != null && picks[it.projectUid] == it.uid }.sortedBy { it.name.lowercase() }
        val week = open.filter { it.weekOf == weekStart }.sortedWith(rank.thenBy(::nameKey))
        val inView = open.filter { it.weekOf != weekStart && it.inViewAt != null }
            .sortedWith(rank.thenByDescending { it.inViewAt }.thenBy(::nameKey))
        return designated + week + inView + (rest - designated.toSet()).sortedWith(rank.thenBy(::nameKey))
    }

    /** Plafond de Suggérées dans Aujourd'hui : réglage serveur par défaut (`maxSuggestions`, 20). */
    const val MAX_SUGGESTIONS = 20

    private const val HORIZON_DAYS = 3L

    private fun nameKey(task: TaskItem): String = task.name.lowercase()

    /** Ordre d'un groupe de suggestions (`ranking.js`) : priorité, projet avant sans projet, échéance proche ; le départage (mise en vue, nom) est celui de l'appelant. */
    private val rank: Comparator<TaskItem> = compareByDescending<TaskItem> { task ->
        task.priority?.let { it.coerceIn(TaskPriority.LOW, TaskPriority.HIGH) + 1 } ?: 0
    }
        .thenBy { it.projectUid == null }
        .thenBy { it.dueDate ?: Instant.MAX }

    fun overdue(tasks: List<TaskItem>, today: LocalDate, now: Instant): List<TaskItem> =
        today(tasks, today, now).filter { isOverdue(it, today) }

    /**
     * Signal « en retard » d'une ligne, d'une fiche ou du bac de l'Agenda : échéance passée d'une tâche
     * ouverte. Une tâche mise de côté (« Plus tard ») ne l'est jamais, comme dans [today].
     */
    fun isOverdue(task: TaskItem, today: LocalDate): Boolean =
        !task.isClosed && !task.someday && task.dueDay?.isBefore(today) == true

    /**
     * Tâches à échéance dans les [days] prochains jours, après aujourd'hui, groupées par jour. Une série ouverte
     * y ajoute ses occurrences à venir ([RecurrenceExpansion], `virtual`), même quand son occurrence enregistrée
     * est déjà passée : en retard, elle reste dans Aujourd'hui et Upcoming ne montre que la suite, comme le web
     * (docs/03-upcoming-view.md). Seule l'occurrence enregistrée se coche.
     */
    fun upcoming(
        tasks: List<TaskItem>,
        today: LocalDate,
        now: Instant,
        zone: ZoneId,
        days: Long = 7,
    ): Map<LocalDate, List<TaskItem>> {
        val first = today.plusDays(1)
        val last = today.plusDays(days)
        val open = tasks.filter { visibleNow(it, now) }
        val stored = open.filter { task -> task.dueDay?.let { it.isAfter(today) && !it.isAfter(last) } == true }
        val later = open.flatMap { RecurrenceExpansion.expand(it, first, last, zone) }
        return (stored + later)
            .sortedWith(compareBy({ it.dueDay }, { it.dueDate }))
            .groupBy { it.dueDay!! }
    }

    /**
     * Occurrences d'aujourd'hui des séries dont l'occurrence enregistrée est déjà passée (en retard) : le web les
     * compte pour aujourd'hui sans empiler les jours manqués, une seule ligne par série.
     */
    fun todayOccurrences(tasks: List<TaskItem>, today: LocalDate, now: Instant, zone: ZoneId): List<TaskItem> =
        tasks.filter { visibleNow(it, now) && !it.someday && it.dueDay?.isBefore(today) == true }
            .flatMap { RecurrenceExpansion.expand(it, today, today, zone) }

    /**
     * À classer : tâches ouvertes de premier niveau que rien ne range encore, sans échéance, hors « Plus tard »,
     * hors vue et semaine décidée, ni reportées ni récurrentes. Une tâche sans projet ni domaine s'y trouve ; une
     * tâche rangée s'y trouve aussi tant qu'elle attend son quand ([TaskItem.needsWhen], « Quand ? » dans la file).
     * Une semaine passée ne compte plus : la tâche redevient à classer. Un mois décidé n'écarte la tâche qu'avant ce
     * mois : dès le 1er, elle revient pour être planifiée (comme le serveur, `docs/41-auto-classify.md`). Une tâche au
     * plan d'aujourd'hui ou d'un jour à venir ([planned], uids des lignes du plan à partir d'aujourd'hui) est rangée ;
     * une ligne d'un jour passé ne range rien. [monthStart] : premier jour du mois en cours.
     */
    fun unsorted(
        tasks: List<TaskItem>,
        now: Instant,
        weekStart: LocalDate,
        monthStart: LocalDate = weekStart.withDayOfMonth(1),
        planned: Set<String> = emptySet(),
    ): List<TaskItem> =
        tasks.filter {
            visibleNow(it, now) && it.dueDate == null && it.dueDay == null &&
                (it.projectUid == null && it.areaUid == null || it.needsWhen) &&
                !it.someday && it.inViewAt == null && !it.isWeekDecided(weekStart) && !it.isMonthDecided(monthStart) &&
                !it.isRecurring && it.uid !in planned
        }

    /** Mois décidé pour un mois suivant ; le mois en cours et un mois passé ne rangent plus la tâche. */
    private fun TaskItem.isMonthDecided(monthStart: LocalDate): Boolean =
        monthOf != null && monthOf.isAfter(monthStart)

    /** Semaine décidée pour la semaine en cours ou une suivante ; une semaine passée ne compte pas. */
    private fun TaskItem.isWeekDecided(weekStart: LocalDate): Boolean =
        weekOf != null && !weekOf.isBefore(weekStart)

    /**
     * Valeur de `needs_when` qui accompagne un quand choisi (date, semaine, vue, « Plus tard », report) : elle
     * retombe seulement si la tâche attendait son quand, comme le serveur qui la remet à faux.
     */
    fun whenSettled(task: TaskItem): Boolean? = if (task.needsWhen) false else null

    fun ofProject(tasks: List<TaskItem>, projectUid: String, now: Instant): List<TaskItem> =
        tasks.filter { it.projectUid == projectUid && visibleNow(it, now) }
            .sortedWith(compareBy<TaskItem> { it.dueDate == null }.thenBy { it.dueDate }.thenBy(::nameKey))

    /**
     * Report d'une tâche au [day] : une échéance à heure fixe garde son heure locale,
     * sinon la tâche redevient une échéance de journée.
     */
    fun postponeChange(task: TaskItem, day: LocalDate, zone: ZoneId): TaskChange {
        val time = task.dueDate?.takeIf { task.dueHasTime }?.atZone(zone)?.toLocalTime()
        return TaskChange(dueDate = day, dueTime = time?.format(hourMinute), needsWhen = whenSettled(task))
    }

    fun completedToday(tasks: List<TaskItem>, today: LocalDate, zone: ZoneId): List<TaskItem> =
        tasks.filter { it.status == TaskStatus.DONE && it.completedAt?.atZone(zone)?.toLocalDate() == today }

    private val hourMinute: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

    private val todayOrder =
        compareBy<TaskItem> { it.pinnedAt == null }
            .thenByDescending { it.priority ?: -1 }
            .thenBy { it.dueDay }
            .thenBy { if (it.dueHasTime) it.dueDate else null }
            .thenBy { it.name.lowercase() }
}
