package ch.nicolab.cadence.tasks.proposals

import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Les propositions de l'app (`docs/47-proposals.md`) ; la carrière et le week-end sont lus, pas demandés depuis l'app. */
enum class ProposalKind(val wire: String) {
    WEEK("week"),
    REVIEW("review"),
    CAREER("career"),
    WEEKEND("weekend");

    companion object {
        fun of(wire: String?): ProposalKind? = entries.firstOrNull { it.wire == wire }
    }
}

enum class ProposalStatus(val wire: String) {
    PENDING("pending"),
    READY("ready"),
    FAILED("failed"),
    APPLIED("applied"),
    DISMISSED("dismissed");

    companion object {
        fun of(wire: String?): ProposalStatus? = entries.firstOrNull { it.wire == wire }
    }
}

@Serializable
data class ProposalDto(
    val uid: String = "",
    val kind: String = "",
    val status: String = "",
    val error: String? = null,
    val answer: ProposalAnswerDto? = null,
    val facts: JsonObject? = null,
    @SerialName("period_start") val periodStart: String? = null,
    @SerialName("period_end") val periodEnd: String? = null,
    /** Jours de la période, calculés à chaque lecture (week seulement) ; absent sur un serveur d'avant : la charge vient des faits. */
    val days: List<ProposalDayDto>? = null,
)

/** Un jour de la période dans `GET /api/proposals/:uid` › `days` (`docs/47-proposals.md`, « Week sheet v2 »). */
@Serializable
data class ProposalDayDto(
    val date: String = "",
    @SerialName("load_minutes") val loadMinutes: Int = 0,
    @SerialName("capacity_minutes") val capacityMinutes: Int? = null,
    val items: List<DayItemDto> = emptyList(),
    val events: List<DayEventDto> = emptyList(),
    val work: DayWorkDto? = null,
)

@Serializable
data class DayItemDto(@SerialName("task_uid") val taskUid: String = "", val name: String = "", val minutes: Int = 0)

@Serializable
data class DayEventDto(
    val title: String = "",
    val start: String? = null,
    val end: String? = null,
    @SerialName("all_day") val allDay: Boolean = false,
)

@Serializable
data class DayWorkDto(val start: String = "", val end: String = "", val label: String? = null)

@Serializable
internal data class ProposalListDto(val proposals: List<ProposalDto> = emptyList())

@Serializable
data class ProposalAnswerDto(
    val headline: String? = null,
    val subtitle: String? = null,
    /** Contrat v1 : remplacé par [subtitle], gardé pour lire les réponses d'avant. */
    val summary: String = "",
    val questions: List<QuestionDto> = emptyList(),
    val changes: List<ChangeDto> = emptyList(),
    val items: List<ReviewItemDto> = emptyList(),
)

@Serializable
data class QuestionDto(val id: String = "", val text: String = "", val choices: List<String> = emptyList())

@Serializable
data class ChangeDto(
    @SerialName("task_uid") val taskUid: String = "",
    val op: String = "",
    val date: String? = null,
    val reason: String = "",
)

@Serializable
data class ReviewItemDto(
    @SerialName("task_uid") val taskUid: String = "",
    val choice: String = "",
    val reason: String = "",
)

@Serializable
internal data class FactTaskDto(
    val uid: String = "",
    val name: String = "",
    val due: String? = null,
    val overdue: Boolean = false,
)

@Serializable
internal data class FactDayDto(val date: String = "", @SerialName("load_minutes") val loadMinutes: Int = 0)

@Serializable
internal data class FactsDto(
    val today: String? = null,
    val tasks: List<FactTaskDto> = emptyList(),
    val days: List<FactDayDto> = emptyList(),
)

/** Décodage tolérant : les champs inconnus du serveur sont ignorés, une valeur absente prend son défaut. */
internal val ProposalJson = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
}

/** Ce que la feuille et le bouton montrent d'une proposition : rien, en préparation, ou prête. */
sealed interface ProposalPhase {
    data object Idle : ProposalPhase

    data class Preparing(val uid: String) : ProposalPhase

    data class Ready(val uid: String) : ProposalPhase

    companion object {
        /** Un échec ou une proposition appliquée remet le bouton à son état de départ : un nouvel appui relance. */
        fun of(proposal: ProposalDto?): ProposalPhase {
            if (proposal == null) return Idle
            return when (ProposalStatus.of(proposal.status)) {
                ProposalStatus.PENDING -> Preparing(proposal.uid)
                ProposalStatus.READY -> Ready(proposal.uid)
                else -> Idle
            }
        }
    }
}

enum class ProposalOp(val wire: String) {
    PLAN_DAY("plan_day"),
    THIS_WEEK("this_week"),
    NEXT_WEEK("next_week"),
    THIS_MONTH("this_month"),
    NEXT_MONTH("next_month"),
    LATER("later"),
    DUE("due"),
    DROP("drop"),
    KEEP("keep");

    companion object {
        fun of(wire: String?): ProposalOp? = entries.firstOrNull { it.wire == wire }
    }
}

/** Un changement de la semaine, tel que le serveur l'a validé ; [date] n'existe que pour `plan_day` et `due`. */
data class WeekChange(val taskUid: String, val op: ProposalOp, val date: LocalDate?, val reason: String)

/** Une tâche des faits : ce que la feuille montre ; [overdue] range la ligne dans « Échues ». */
data class FactTask(val uid: String, val name: String, val due: LocalDate?, val overdue: Boolean)

data class DayItem(val taskUid: String, val name: String, val minutes: Int)

data class DayEvent(val title: String, val start: String?, val end: String?, val allDay: Boolean)

data class DayWork(val start: String, val end: String, val label: String?)

/**
 * Un jour de la période : charge planifiée, capacité (null si inconnue) et ce qui le remplit. [occupied] et
 * [fill] alimentent la bande des jours ; une capacité inconnue compte [Proposals.FALLBACK_CAPACITY_MINUTES].
 */
data class DayLoad(
    val date: LocalDate,
    val loadMinutes: Int,
    val capacityMinutes: Int?,
    val items: List<DayItem>,
    val events: List<DayEvent>,
    val work: DayWork?,
) {
    /** Journée prise : un événement sur toute la journée, ou une capacité nulle (un long événement couvre les heures de travail). */
    val occupied: Boolean get() = capacityMinutes == 0 || events.any { it.allDay }

    /** Part de la capacité déjà planifiée, de 0 à 1. */
    val fill: Float
        get() = if (occupied) 1f else (loadMinutes.toFloat() / (capacityMinutes ?: Proposals.FALLBACK_CAPACITY_MINUTES)).coerceIn(0f, 1f)

    /** Journée pleine : la barre passe à la couleur d'alerte. */
    val full: Boolean get() = occupied || (loadMinutes > 0 && loadMinutes >= (capacityMinutes ?: Proposals.FALLBACK_CAPACITY_MINUTES))
}

/** Ce qu'on fait d'une tâche de la semaine : une opération, et sa date pour `plan_day` et `due`. */
data class WeekDecision(val op: ProposalOp, val date: LocalDate? = null)

/** Sections de la feuille, dans l'ordre : en retard (quelle que soit la décision), journée choisie, le reste. */
enum class SheetSection { OVERDUE, DAYS, LATER }

data class SheetGroup(val section: SheetSection, val changes: List<WeekChange>)

/** Compte du pied de feuille : [changes] décisions qui changent une tâche, [kept] tâches gardées telles quelles, [returned] remarques. */
data class WeekCounts(val changes: Int, val kept: Int, val returned: Int)

data class ReviewJudgement(val taskUid: String, val choice: String, val reason: String)

data class ApplyOutcome(val applied: Int, val failed: Int)

/** Règles pures des propositions : décisions de la semaine, regroupement, corps des requêtes, lecture des réponses. */
object Proposals {
    /** Longueur maximale d'une remarque envoyée à l'agent. */
    const val NOTE_MAX_LENGTH = 500

    /** Capacité supposée d'une journée quand le serveur n'en donne pas : 8 h. */
    const val FALLBACK_CAPACITY_MINUTES = 480

    /** Changements de l'agent. Une date manquante pour `plan_day` ou `due` ôte le changement. */
    fun weekChanges(answer: ProposalAnswerDto?): List<WeekChange> =
        answer?.changes.orEmpty().mapNotNull { change ->
            val op = ProposalOp.of(change.op) ?: return@mapNotNull null
            if (change.taskUid.isBlank()) return@mapNotNull null
            val date = change.date?.let(::dateOrNull)
            if ((op == ProposalOp.PLAN_DAY || op == ProposalOp.DUE) && date == null) return@mapNotNull null
            WeekChange(change.taskUid, op, date, change.reason)
        }

    /** Titre de la feuille : la phrase de la réponse ; null pour une réponse d'avant, la feuille met « Ta semaine ». */
    fun headlineOf(answer: ProposalAnswerDto?): String? = answer?.headline?.trim()?.takeIf { it.isNotEmpty() }

    /** Sous-titre : le `subtitle` du contrat, ou le `summary` d'avant. */
    fun subtitleOf(answer: ProposalAnswerDto?): String? =
        (answer?.subtitle ?: answer?.summary)?.trim()?.takeIf { it.isNotEmpty() }

    /**
     * Une ligne par tâche des faits, dans leur ordre : le changement de l'agent, sinon « garder » (une tâche sans
     * changement n'est pas une erreur). Un changement sur une tâche absente des faits est ignoré. Sans faits
     * (réponse d'avant), les changements tels quels.
     */
    fun weekRows(tasks: Map<String, FactTask>, changes: List<WeekChange>): List<WeekChange> {
        if (tasks.isEmpty()) return changes
        val byTask = HashMap<String, WeekChange>()
        changes.forEach { byTask.putIfAbsent(it.taskUid, it) }
        return tasks.values.map { task -> byTask[task.uid] ?: WeekChange(task.uid, ProposalOp.KEEP, null, "") }
    }

    /** Décision courante d'une tâche : celle que l'utilisateur a choisie, sinon celle de l'agent. */
    fun decision(change: WeekChange, chosen: Map<String, WeekDecision>): WeekDecision =
        chosen[change.taskUid] ?: suggested(change)

    fun isModified(change: WeekChange, chosen: Map<String, WeekDecision>): Boolean = chosen.containsKey(change.taskUid)

    /** Choisit [decision] pour la tâche. Revenir à la suggestion de l'agent retire le choix : la ligne n'est plus « modifiée ». */
    fun choose(chosen: Map<String, WeekDecision>, change: WeekChange, decision: WeekDecision): Map<String, WeekDecision> =
        if (decision == suggested(change)) chosen - change.taskUid else chosen + (change.taskUid to decision)

    fun restore(chosen: Map<String, WeekDecision>, taskUid: String): Map<String, WeekDecision> = chosen - taskUid

    /**
     * Sections de la feuille, vides exclues : « Échues » (tâche en retard, quelle que soit sa décision), « Par jour »
     * (décision une journée), « Plus loin » (le reste). Dans une section, l'ordre des faits.
     */
    fun sections(rows: List<WeekChange>, chosen: Map<String, WeekDecision>, tasks: Map<String, FactTask>): List<SheetGroup> {
        val grouped = rows.groupBy { sectionOf(it, chosen, tasks) }
        return SheetSection.entries.mapNotNull { section -> grouped[section]?.let { SheetGroup(section, it) } }
    }

    private fun sectionOf(change: WeekChange, chosen: Map<String, WeekDecision>, tasks: Map<String, FactTask>): SheetSection = when {
        tasks[change.taskUid]?.overdue == true -> SheetSection.OVERDUE
        decision(change, chosen).op == ProposalOp.PLAN_DAY -> SheetSection.DAYS
        else -> SheetSection.LATER
    }

    /** Jours de retard d'une tâche en retard (1 = hier) ; null si elle n'est pas en retard ou si une date manque. */
    fun lateness(task: FactTask, today: LocalDate?): Int? =
        if (task.overdue && task.due != null && today != null) ChronoUnit.DAYS.between(task.due, today).toInt() else null

    /** La période de la feuille : la décision d'une journée, sinon le premier jour de la période. */
    fun focusDay(decision: WeekDecision, period: Pair<LocalDate, LocalDate>?): LocalDate? =
        (decision.date.takeIf { decision.op == ProposalOp.PLAN_DAY }) ?: period?.first

    /** Options du menu d'une tâche : chaque jour de la période, puis cette semaine, la suivante, les mois, plus tard, garder et abandonner. */
    fun menuOptions(start: LocalDate?, end: LocalDate?): List<WeekDecision> {
        val days = if (start != null && end != null && !end.isBefore(start)) {
            generateSequence(start) { it.plusDays(1) }.takeWhile { !it.isAfter(end) }.take(MAX_MENU_DAYS)
                .map { WeekDecision(ProposalOp.PLAN_DAY, it) }.toList()
        } else {
            emptyList()
        }
        return days + listOf(
            WeekDecision(ProposalOp.THIS_WEEK),
            WeekDecision(ProposalOp.NEXT_WEEK),
            WeekDecision(ProposalOp.THIS_MONTH),
            WeekDecision(ProposalOp.NEXT_MONTH),
            WeekDecision(ProposalOp.LATER),
            WeekDecision(ProposalOp.KEEP),
            WeekDecision(ProposalOp.DROP),
        )
    }

    /** Nombre de décisions qui changent quelque chose : « Appliquer (N) ». */
    fun pendingCount(changes: List<WeekChange>, chosen: Map<String, WeekDecision>): Int =
        changes.count { decision(it, chosen).op != ProposalOp.KEEP }

    /** Texte d'une remarque, sans espaces autour ; un texte vide n'est pas une remarque. */
    fun noteOf(raw: String?): String? = raw?.trim()?.takeIf { it.isNotEmpty() }

    fun hasNote(change: WeekChange, notes: Map<String, String>): Boolean = noteOf(notes[change.taskUid]) != null

    /** Compte du pied : les lignes sans remarque (changements et gardées), puis les remarques. */
    fun counts(rows: List<WeekChange>, chosen: Map<String, WeekDecision>, notes: Map<String, String>): WeekCounts {
        val unnoted = rows.filterNot { hasNote(it, notes) }
        return WeekCounts(
            changes = unnoted.count { decision(it, chosen).op != ProposalOp.KEEP },
            kept = unnoted.count { decision(it, chosen).op == ProposalOp.KEEP },
            returned = rows.size - unnoted.size,
        )
    }

    /** Choix préparé d'une question : taper un autre choix le remplace, retaper le même le retire. Rien n'est envoyé. */
    fun chooseAnswer(answers: Map<String, String>, questionId: String, choice: String): Map<String, String> =
        if (answers[questionId] == choice) answers - questionId else answers + (questionId to choice)

    /** « Envoyer » quand une question a une réponse ou qu'une ligne a une remarque ; sinon « Appliquer ». */
    fun needsSend(counts: WeekCounts, answers: Map<String, String>): Boolean = counts.returned > 0 || answers.isNotEmpty()

    /**
     * Corps de `POST …/send` : les décisions sans remarque et sans `keep`, puis les remarques de la réponse
     * (une par tâche, texte rogné) et les réponses aux questions. Une remarque sur une tâche absente de la réponse n'est pas envoyée.
     */
    fun sendBody(
        changes: List<WeekChange>,
        chosen: Map<String, WeekDecision>,
        notes: Map<String, String>,
        answers: Map<String, String> = emptyMap(),
    ): JsonObject = buildJsonObject {
        put(
            "decisions",
            buildJsonArray {
                changes.forEach { change ->
                    val decision = decision(change, chosen)
                    if (hasNote(change, notes) || decision.op == ProposalOp.KEEP) return@forEach
                    add(decisionObject(change, decision))
                }
            },
        )
        put(
            "notes",
            buildJsonArray {
                changes.forEach { change ->
                    val text = noteOf(notes[change.taskUid]) ?: return@forEach
                    add(buildJsonObject {
                        put("task_uid", change.taskUid)
                        put("text", text)
                    })
                }
            },
        )
        put(
            "answers",
            buildJsonArray {
                answers.forEach { (questionId, choice) ->
                    add(buildJsonObject {
                        put("question_id", questionId)
                        put("choice", choice)
                    })
                }
            },
        )
    }

    /** Corps de `POST …/apply` : une décision par tâche qui change, `keep` n'est pas envoyé. */
    fun weekApplyBody(changes: List<WeekChange>, chosen: Map<String, WeekDecision>): JsonObject = buildJsonObject {
        put(
            "decisions",
            buildJsonArray {
                changes.forEach { change ->
                    val decision = decision(change, chosen)
                    if (decision.op == ProposalOp.KEEP) return@forEach
                    add(decisionObject(change, decision))
                }
            },
        )
    }

    private fun decisionObject(change: WeekChange, decision: WeekDecision): JsonObject = buildJsonObject {
        put("task_uid", change.taskUid)
        put("op", decision.op.wire)
        decision.date?.let { put("date", it.toString()) }
    }

    /** Le choix de chaque tâche jugée par l'agent ; une entrée vide ou répétée n'en fait qu'une. */
    fun reviewJudgements(answer: ProposalAnswerDto?): Map<String, ReviewJudgement> =
        answer?.items.orEmpty()
            .filter { it.taskUid.isNotBlank() && it.choice.isNotBlank() }
            .associate { it.taskUid to ReviewJudgement(it.taskUid, it.choice, it.reason) }

    /** Jugements utilisables : ceux d'une revue prête, et encore ceux d'une revue déjà appliquée en partie. */
    fun judgementsOf(proposal: ProposalDto?): Map<String, ReviewJudgement> {
        val status = ProposalStatus.of(proposal?.status)
        if (status != ProposalStatus.READY && status != ProposalStatus.APPLIED) return emptyMap()
        return reviewJudgements(proposal?.answer)
    }

    fun reviewApplyBody(decisions: List<ReviewJudgement>): JsonObject = buildJsonObject {
        put(
            "decisions",
            buildJsonArray {
                decisions.forEach { decision ->
                    add(buildJsonObject {
                        put("task_uid", decision.taskUid)
                        put("choice", decision.choice)
                    })
                }
            },
        )
    }

    /** Réponse envoyée quand on tape un choix d'une question : la question suivie du choix. */
    fun questionReply(question: QuestionDto, choice: String): String = "${question.text.trim()} ${choice.trim()}"

    fun factTasks(facts: JsonObject?): Map<String, FactTask> =
        parseFacts(facts)?.tasks.orEmpty().filter { it.uid.isNotBlank() }
            .associate { it.uid to FactTask(it.uid, it.name, dateOrNull(it.due), it.overdue) }

    fun factToday(facts: JsonObject?): LocalDate? = dateOrNull(parseFacts(facts)?.today)

    /** Les jours de la période : `days` du serveur si présent, sinon la seule charge des faits. */
    fun dayLoads(days: List<ProposalDayDto>?, facts: JsonObject?): List<DayLoad> {
        val loads = if (days != null) {
            days.mapNotNull { day ->
                dateOrNull(day.date)?.let { date ->
                    DayLoad(
                        date = date,
                        loadMinutes = day.loadMinutes,
                        capacityMinutes = day.capacityMinutes,
                        items = day.items.map { DayItem(it.taskUid, it.name, it.minutes) },
                        events = day.events.map { DayEvent(it.title, it.start, it.end, it.allDay) },
                        work = day.work?.let { DayWork(it.start, it.end, it.label?.takeIf(String::isNotBlank)) },
                    )
                }
            }
        } else {
            parseFacts(facts)?.days.orEmpty().mapNotNull { day ->
                dateOrNull(day.date)?.let { DayLoad(it, day.loadMinutes, null, emptyList(), emptyList(), null) }
            }
        }
        return loads.sortedBy { it.date }
    }

    private fun parseFacts(facts: JsonObject?): FactsDto? =
        facts?.let { runCatching { ProposalJson.decodeFromJsonElement(FactsDto.serializer(), it) }.getOrNull() }

    /** Lit `{ results: [{ state }] }` de la réponse d'un apply : combien de changements sont passés. */
    fun applyOutcome(body: JsonObject): ApplyOutcome {
        val states = (body["results"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonObject)?.get("state") as? JsonPrimitive }
            .map { it.content }
        return ApplyOutcome(applied = states.count { it == "applied" }, failed = states.count { it != "applied" })
    }

    private fun suggested(change: WeekChange) = WeekDecision(change.op, change.date)

    private const val MAX_MENU_DAYS = 14

    private fun dateOrNull(value: String?): LocalDate? = value?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
}
