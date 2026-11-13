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

/** Les deux propositions de l'app (`docs/47-proposals.md`). */
enum class ProposalKind(val wire: String) {
    WEEK("week"),
    REVIEW("review");

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
internal data class FactTaskDto(val uid: String = "", val name: String = "", val project: String? = null)

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
    LATER("later"),
    DUE("due"),
    DROP("drop");

    companion object {
        fun of(wire: String?): ProposalOp? = entries.firstOrNull { it.wire == wire }
    }
}

/** Un changement de la semaine, tel que le serveur l'a validé ; [date] n'existe que pour `plan_day` et `due`. */
data class WeekChange(val taskUid: String, val op: ProposalOp, val date: LocalDate?, val reason: String)

/** Changements d'un même jour ; [date] nul regroupe ceux qui n'ont pas de jour (cette semaine, plus tard, abandonner). */
data class ChangeGroup(val date: LocalDate?, val changes: List<WeekChange>)

data class FactTask(val uid: String, val name: String, val project: String?)

data class ReviewJudgement(val taskUid: String, val choice: String, val reason: String)

data class ApplyOutcome(val applied: Int, val failed: Int)

/** Règles pures des propositions : regroupement, coches, corps des requêtes, lecture des réponses. */
object Proposals {
    fun weekChanges(answer: ProposalAnswerDto?): List<WeekChange> =
        answer?.changes.orEmpty().mapNotNull { change ->
            val op = ProposalOp.of(change.op) ?: return@mapNotNull null
            if (change.taskUid.isBlank()) return@mapNotNull null
            WeekChange(change.taskUid, op, change.date?.let(::dateOrNull), change.reason)
        }

    /** Ordre : les changements sans jour d'abord, puis chaque jour dans l'ordre du calendrier. */
    fun groupByDay(changes: List<WeekChange>): List<ChangeGroup> {
        val undated = changes.filter { it.date == null }
        val dated = changes.mapNotNull { change -> change.date?.let { day -> day to change } }
            .groupBy({ it.first }, { it.second })
            .toSortedMap()
        return buildList {
            if (undated.isNotEmpty()) add(ChangeGroup(null, undated))
            dated.forEach { (day, list) -> add(ChangeGroup(day, list)) }
        }
    }

    /** Les changements gardés : tous, sauf ceux dont la case est décochée. */
    fun checked(changes: List<WeekChange>, unchecked: Set<String>): List<WeekChange> =
        changes.filter { it.taskUid !in unchecked }

    fun toggle(unchecked: Set<String>, taskUid: String): Set<String> =
        if (taskUid in unchecked) unchecked - taskUid else unchecked + taskUid

    fun weekApplyBody(changes: List<WeekChange>, unchecked: Set<String>): JsonObject {
        val uids = checked(changes, unchecked).map { it.taskUid }.distinct()
        return buildJsonObject { put("task_uids", JsonArray(uids.map(::JsonPrimitive))) }
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
        return parsed.tasks.filter { it.uid.isNotBlank() }.associate { it.uid to FactTask(it.uid, it.name, it.project) }
    }

    /** Lit `{ results: [{ state }] }` de la réponse d'un apply : combien de changements sont passés. */
    fun applyOutcome(body: JsonObject): ApplyOutcome {
        val states = (body["results"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonObject)?.get("state") as? JsonPrimitive }
            .map { it.content }
        return ApplyOutcome(applied = states.count { it == "applied" }, failed = states.count { it != "applied" })
    }

    private fun dateOrNull(value: String): LocalDate? = runCatching { LocalDate.parse(value.take(10)) }.getOrNull()
}
