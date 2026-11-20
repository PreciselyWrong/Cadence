package ch.nicolab.cadence.tasks.proposals

import java.time.LocalDate
import java.time.LocalTime
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Gestes de balayage de la carte de l'étape 1 (« Hier et retards »). */
enum class RitualSwipe { RIGHT, LEFT, UP }

/** Une carte de l'étape 1 : une tâche en retard, son retard en jours et l'éventuel conseil de l'agent. */
data class MorningCard(
    val task: FactTask,
    val latenessDays: Int?,
    val advice: WeekChange?,
    val defaultChoice: WeekDecision,
) {
    val hasAdvice: Boolean get() = advice != null && advice.op != ProposalOp.KEEP
}

/** Une tâche prévue aujourd'hui dans l'étape 2 (« Ta journée »). */
data class MorningDayItem(
    val taskUid: String,
    val name: String,
    val minutes: Int,
    val project: String?,
    val focus: Boolean,
    val decision: WeekDecision,
)

/** Entrée chronologique de l'étape 2 : événement d'agenda ou tâche du jour. */
sealed interface MorningTimelineEntry {
    data class Event(val title: String, val start: String?, val end: String?, val allDay: Boolean) : MorningTimelineEntry
    data class Task(val item: MorningDayItem) : MorningTimelineEntry
}

/** Vue dérivée de la journée à l'étape 2 : priorités (« Ce qui compte »), chronologie et charge. */
data class MorningDayPlan(
    val focus: List<MorningDayItem>,
    val timeline: List<MorningTimelineEntry>,
    val plannedMinutes: Int,
    val capacityMinutes: Int,
    val freeMinutes: Int,
    val overloaded: Boolean,
)

/**
 * Règles pures du rituel du matin (`docs/50-morning-ritual.md`) : cartes de l'étape 1, balayages,
 * journée de l'étape 2 et corps de `POST /api/proposals/:uid/apply`.
 */
/** Étapes de « Ma matinée », dans l'ordre : les mails d'abord, puis les retards et la journée ; Aujourd'hui ensuite. */
enum class MorningStep { MAILS, RITUAL }

object MorningRitual {
    const val TRIGGER_MORNING = "morning"

    /** Les mails seuls n'appellent « Ma matinée » que le matin ; un rituel prêt reste proposé toute la journée. */
    private val MAILS_UNTIL = LocalTime.NOON

    /** Ce que « Ma matinée » enchaîne : le paquet Mail s'il reste des cartes, puis le rituel s'il est prêt. */
    fun steps(mailsWaiting: Int, ritualReady: Boolean): List<MorningStep> = buildList {
        if (mailsWaiting > 0) add(MorningStep.MAILS)
        if (ritualReady) add(MorningStep.RITUAL)
    }

    /** L'entrée « Ma matinée » d'Aujourd'hui : un rituel prêt, ou des mails à trier avant midi. */
    fun entryVisible(mailsWaiting: Int, ritualReady: Boolean, now: LocalTime): Boolean =
        ritualReady || (mailsWaiting > 0 && now < MAILS_UNTIL)
    const val MAX_FOCUS = 3
    const val DEFAULT_TASK_MINUTES = 30

    fun isMorning(proposal: ProposalDto?): Boolean = proposal?.trigger == TRIGGER_MORNING

    /** Vrai quand une proposition du matin prête porte sur [today] (pour le bandeau d'Aujourd'hui). */
    fun isReadyForToday(proposal: ProposalDto?, today: LocalDate): Boolean {
        if (proposal == null) return false
        if (ProposalKind.of(proposal.kind) != ProposalKind.WEEK) return false
        if (ProposalStatus.of(proposal.status) != ProposalStatus.READY) return false
        if (!isMorning(proposal)) return false
        val factToday = Proposals.factToday(proposal.facts)
        val periodStart = dateOrNull(proposal.periodStart)
        val createdToday = proposal.createdAt?.startsWith(today.toString()) == true
        return factToday == today || periodStart == today || createdToday
    }

    /** Cartes de l'étape 1 : les tâches en retard des faits, du plus ancien retard au plus récent. */
    fun cards(proposal: ProposalDto, today: LocalDate): List<MorningCard> {
        val factTasks = Proposals.factTasks(proposal.facts)
        val changesByTask = Proposals.weekChanges(proposal.answer).associateBy { it.taskUid }
        return factTasks.values
            .filter { it.overdue }
            .sortedBy { it.due ?: LocalDate.MAX }
            .map { task ->
                val advice = changesByTask[task.uid]?.takeIf { it.op != ProposalOp.KEEP }
                val defaultChoice = advice?.let { WeekDecision(it.op, it.date) } ?: WeekDecision(ProposalOp.PLAN_DAY, today)
                MorningCard(
                    task = task,
                    latenessDays = Proposals.lateness(task, today),
                    advice = advice,
                    defaultChoice = defaultChoice,
                )
            }
    }

    /** Correspondance des gestes : droite = conseil (ou aujourd'hui), gauche = demain, haut = plus tard. */
    fun swipeChoice(swipe: RitualSwipe, card: MorningCard, today: LocalDate): WeekDecision = when (swipe) {
        RitualSwipe.RIGHT -> card.defaultChoice
        RitualSwipe.LEFT -> WeekDecision(ProposalOp.PLAN_DAY, today.plusDays(1))
        RitualSwipe.UP -> WeekDecision(ProposalOp.LATER)
    }

    /** Jusqu'à trois tâches `focus` connues des faits, dans l'ordre de la réponse. */
    fun initialFocus(proposal: ProposalDto): Set<String> {
        val factTasks = Proposals.factTasks(proposal.facts)
        return proposal.answer?.focus.orEmpty()
            .filter { it in factTasks }
            .distinct()
            .take(MAX_FOCUS)
            .toSet()
    }

    /** Ajoute ou retire [taskUid] des priorités (3 au plus). */
    fun toggleFocus(currentFocus: Set<String>, taskUid: String): Set<String> = when {
        taskUid in currentFocus -> currentFocus - taskUid
        currentFocus.size < MAX_FOCUS -> currentFocus + taskUid
        else -> currentFocus
    }

    /**
     * Journée de l'étape 2 : d'abord les tâches `focus` (seulement si elles sont prévues aujourd'hui),
     * puis les événements d'agenda dans l'ordre horaire et les autres tâches du jour, et la charge.
     */
    fun dayPlan(
        proposal: ProposalDto,
        today: LocalDate,
        chosen: Map<String, WeekDecision>,
        focusUids: Set<String>,
    ): MorningDayPlan {
        val factTasks = Proposals.factTasks(proposal.facts)
        val changesByTask = Proposals.weekChanges(proposal.answer).associateBy { it.taskUid }
        val todayLoad = Proposals.dayLoads(proposal.days, proposal.facts).firstOrNull { it.date == today }
        val existingItems = todayLoad?.items.orEmpty().associateBy { it.taskUid }

        fun effectiveDecision(uid: String): WeekDecision? {
            chosen[uid]?.let { return it }
            val task = factTasks[uid]
            val advice = changesByTask[uid]?.takeIf { it.op != ProposalOp.KEEP }?.let { WeekDecision(it.op, it.date) }
            if (task?.overdue == true) return advice ?: WeekDecision(ProposalOp.PLAN_DAY, today)
            return advice
        }

        fun isPlannedToday(uid: String): Boolean {
            val decision = effectiveDecision(uid)
            if (decision != null) {
                if (decision.op == ProposalOp.KEEP) return uid in existingItems
                return decision.op == ProposalOp.PLAN_DAY && decision.date == today
            }
            return uid in existingItems
        }

        val orderedUids = LinkedHashSet<String>()
        todayLoad?.items.orEmpty().forEach { item ->
            if (item.taskUid.isNotBlank() && isPlannedToday(item.taskUid)) orderedUids.add(item.taskUid)
        }
        factTasks.keys.forEach { uid ->
            if (isPlannedToday(uid)) orderedUids.add(uid)
        }

        val todayItems = orderedUids.map { uid ->
            val fact = factTasks[uid]
            val dayItem = existingItems[uid]
            val minutes = dayItem?.minutes?.takeIf { it > 0 }
                ?: fact?.estimateMin?.takeIf { it > 0 }
                ?: DEFAULT_TASK_MINUTES
            MorningDayItem(
                taskUid = uid,
                name = fact?.name ?: dayItem?.name.orEmpty(),
                minutes = minutes,
                project = fact?.project,
                focus = uid in focusUids,
                decision = effectiveDecision(uid) ?: WeekDecision(ProposalOp.PLAN_DAY, today),
            )
        }

        val focusItems = todayItems.filter { it.focus }.take(MAX_FOCUS)
        val focusSet = focusItems.mapTo(HashSet()) { it.taskUid }
        val nonFocusItems = todayItems.filterNot { it.taskUid in focusSet }

        val sortedEvents = todayLoad?.events.orEmpty().sortedWith(
            compareBy<DayEvent> { !it.allDay }
                .thenBy { parseEventMinutes(it.start) ?: Int.MAX_VALUE },
        )
        val timeline = sortedEvents.map { MorningTimelineEntry.Event(it.title, it.start, it.end, it.allDay) } +
            nonFocusItems.map { MorningTimelineEntry.Task(it) }

        val plannedMinutes = todayItems.sumOf { it.minutes }
        val capacityMinutes = todayLoad?.capacityMinutes
            ?: workMinutes(todayLoad?.work)
            ?: Proposals.FALLBACK_CAPACITY_MINUTES
        val freeMinutes = (capacityMinutes - plannedMinutes).coerceAtLeast(0)
        return MorningDayPlan(
            focus = focusItems,
            timeline = timeline,
            plannedMinutes = plannedMinutes,
            capacityMinutes = capacityMinutes,
            freeMinutes = freeMinutes,
            overloaded = plannedMinutes > capacityMinutes,
        )
    }

    /**
     * Corps de `POST /api/proposals/:uid/apply` : seulement les tâches montrées par le rituel et décidées
     * par l'utilisateur (`keep` et les tâches non touchées sont omises).
     */
    fun applyBody(shownTaskUids: Set<String>, chosen: Map<String, WeekDecision>): JsonObject = buildJsonObject {
        put(
            "decisions",
            buildJsonArray {
                chosen.forEach { (uid, decision) ->
                    if (uid !in shownTaskUids || decision.op == ProposalOp.KEEP) return@forEach
                    add(
                        buildJsonObject {
                            put("task_uid", uid)
                            put("op", decision.op.wire)
                            decision.date?.let { put("date", it.toString()) }
                        },
                    )
                }
            },
        )
    }

    private fun parseEventMinutes(raw: String?): Int? {
        if (raw.isNullOrBlank()) return null
        val hhmm = if ('T' in raw) raw.substringAfter('T').take(5) else raw.take(5)
        return runCatching { LocalTime.parse(hhmm) }.getOrNull()?.let { it.hour * 60 + it.minute }
    }

    private fun workMinutes(work: DayWork?): Int? {
        if (work == null) return null
        val start = parseEventMinutes(work.start) ?: return null
        val end = parseEventMinutes(work.end) ?: return null
        return (end - start).coerceAtLeast(0)
    }

    private fun dateOrNull(value: String?): LocalDate? =
        value?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
}
