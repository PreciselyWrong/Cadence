package ch.nicolab.cadence.tasks.proposals

import java.time.LocalDate
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
)

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
    val project: String? = null,
    val goal: String? = null,
    val area: String? = null,
)

@Serializable
internal data class FactsDto(val tasks: List<FactTaskDto> = emptyList())

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

data class FactTask(val uid: String, val name: String, val project: String?, val goal: String?, val area: String?)

/** Ce qu'on fait d'une tâche de la semaine : une opération, et sa date pour `plan_day` et `due`. */
data class WeekDecision(val op: ProposalOp, val date: LocalDate? = null)

/**
 * Section de la feuille : les tâches dont la décision courante est [group]. L'ordre des sections est celui de
 * [Proposals.sections] : les jours d'abord, puis cette semaine, semaine prochaine, ce mois-ci, le mois prochain,
 * plus tard, les échéances, abandonner, garder.
 */
data class DecisionSection(val group: DecisionGroup, val changes: List<WeekChange>)

sealed interface DecisionGroup {
    data class Day(val date: LocalDate) : DecisionGroup

    data object ThisWeek : DecisionGroup

    data object NextWeek : DecisionGroup

    data object ThisMonth : DecisionGroup

    data object NextMonth : DecisionGroup

    data object Later : DecisionGroup

    data class Due(val date: LocalDate) : DecisionGroup

    data object Drop : DecisionGroup

    data object Keep : DecisionGroup
}

data class ReviewJudgement(val taskUid: String, val choice: String, val reason: String)

data class ApplyOutcome(val applied: Int, val failed: Int)

/** Ce que « Envoyer » fait : décisions appliquées et tâches renvoyées avec une remarque. */
data class SendCounts(val applied: Int, val returned: Int)

/** Règles pures des propositions : décisions de la semaine, regroupement, corps des requêtes, lecture des réponses. */
object Proposals {
    /** Longueur maximale d'une remarque envoyée à l'agent. */
    const val NOTE_MAX_LENGTH = 500

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

    /** Décision courante d'une tâche : celle que l'utilisateur a choisie, sinon celle de l'agent. */
    fun decision(change: WeekChange, chosen: Map<String, WeekDecision>): WeekDecision =
        chosen[change.taskUid] ?: suggested(change)

    fun isModified(change: WeekChange, chosen: Map<String, WeekDecision>): Boolean = chosen.containsKey(change.taskUid)

    /** Choisit [decision] pour la tâche. Revenir à la suggestion de l'agent retire le choix : la ligne n'est plus « modifiée ». */
    fun choose(chosen: Map<String, WeekDecision>, change: WeekChange, decision: WeekDecision): Map<String, WeekDecision> =
        if (decision == suggested(change)) chosen - change.taskUid else chosen + (change.taskUid to decision)

    fun restore(chosen: Map<String, WeekDecision>, taskUid: String): Map<String, WeekDecision> = chosen - taskUid

    /** Sections par décision courante, vides exclues. */
    fun sections(changes: List<WeekChange>, chosen: Map<String, WeekDecision>): List<DecisionSection> {
        val byGroup = changes.groupBy { groupOf(decision(it, chosen)) }
        return byGroup.keys.sortedWith(GROUP_ORDER).map { DecisionSection(it, byGroup.getValue(it)) }
    }

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

    /**
     * Ce que « Envoyer » fait : [SendCounts.applied] décisions appliquées (ni gardées, ni remarquées) et
     * [SendCounts.returned] tâches renvoyées à l'agent avec leur remarque.
     */
    fun sendCounts(changes: List<WeekChange>, chosen: Map<String, WeekDecision>, notes: Map<String, String>): SendCounts =
        SendCounts(
            applied = changes.count { !hasNote(it, notes) && decision(it, chosen).op != ProposalOp.KEEP },
            returned = changes.count { hasNote(it, notes) },
        )

    /** Choix préparé d'une question : taper un autre choix le remplace, retaper le même le retire. Rien n'est envoyé. */
    fun chooseAnswer(answers: Map<String, String>, questionId: String, choice: String): Map<String, String> =
        if (answers[questionId] == choice) answers - questionId else answers + (questionId to choice)

    /** « Envoyer » quand une question a une réponse ou qu'une ligne a une remarque ; sinon « Appliquer ». */
    fun needsSend(counts: SendCounts, answers: Map<String, String>): Boolean = counts.returned > 0 || answers.isNotEmpty()

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

    fun factTasks(facts: JsonObject?): Map<String, FactTask> {
        if (facts == null) return emptyMap()
        val parsed = runCatching { ProposalJson.decodeFromJsonElement(FactsDto.serializer(), facts) }.getOrNull() ?: return emptyMap()
        return parsed.tasks.filter { it.uid.isNotBlank() }
            .associate { it.uid to FactTask(it.uid, it.name, it.project, it.goal?.takeIf(String::isNotBlank), it.area?.takeIf(String::isNotBlank)) }
    }

    /** Lit `{ results: [{ state }] }` de la réponse d'un apply : combien de changements sont passés. */
    fun applyOutcome(body: JsonObject): ApplyOutcome {
        val states = (body["results"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonObject)?.get("state") as? JsonPrimitive }
            .map { it.content }
        return ApplyOutcome(applied = states.count { it == "applied" }, failed = states.count { it != "applied" })
    }

    private fun suggested(change: WeekChange) = WeekDecision(change.op, change.date)

    private fun groupOf(decision: WeekDecision): DecisionGroup = when (decision.op) {
        ProposalOp.PLAN_DAY -> DecisionGroup.Day(requireNotNull(decision.date))
        ProposalOp.THIS_WEEK -> DecisionGroup.ThisWeek
        ProposalOp.NEXT_WEEK -> DecisionGroup.NextWeek
        ProposalOp.THIS_MONTH -> DecisionGroup.ThisMonth
        ProposalOp.NEXT_MONTH -> DecisionGroup.NextMonth
        ProposalOp.LATER -> DecisionGroup.Later
        ProposalOp.DUE -> DecisionGroup.Due(requireNotNull(decision.date))
        ProposalOp.DROP -> DecisionGroup.Drop
        ProposalOp.KEEP -> DecisionGroup.Keep
    }

    /** Jours, puis cette semaine, semaine prochaine, ce mois-ci, le mois prochain, plus tard, échéances, abandonner, garder ; dans une même catégorie, par date. */
    private val GROUP_ORDER: Comparator<DecisionGroup> = compareBy({ categoryOf(it) }, { dateOf(it) })

    private fun categoryOf(group: DecisionGroup): Int = when (group) {
        is DecisionGroup.Day -> 0
        DecisionGroup.ThisWeek -> 1
        DecisionGroup.NextWeek -> 2
        DecisionGroup.ThisMonth -> 3
        DecisionGroup.NextMonth -> 4
        DecisionGroup.Later -> 5
        is DecisionGroup.Due -> 6
        DecisionGroup.Drop -> 7
        DecisionGroup.Keep -> 8
    }

    private fun dateOf(group: DecisionGroup): LocalDate? = when (group) {
        is DecisionGroup.Day -> group.date
        is DecisionGroup.Due -> group.date
        else -> null
    }

    private const val MAX_MENU_DAYS = 14

    private fun dateOrNull(value: String): LocalDate? = runCatching { LocalDate.parse(value.take(10)) }.getOrNull()
}
