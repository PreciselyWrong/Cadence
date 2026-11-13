package ch.nicolab.cadence.tasks.proposals

import java.time.LocalDate
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Les trois sortes d'éléments d'une proposition de carrière (`docs/47-proposals.md`, « Carrière »). */
enum class CareerKind {
    FOLLOWUP,
    OFFER,
    TASK;

    val wire: String get() = name.lowercase()

    companion object {
        fun of(wire: String?): CareerKind? = entries.firstOrNull { it.wire == wire }
    }
}

/** Décisions possibles : `apply`, `skip`, `later` pour une offre ; `done`, `later`, `task` pour une relance ; `create`, `skip` pour une tâche. */
enum class CareerOp {
    APPLY,
    SKIP,
    LATER,
    DONE,
    TASK,
    CREATE;

    val wire: String get() = name.lowercase()

    companion object {
        fun of(wire: String?): CareerOp? = entries.firstOrNull { it.wire == wire }
    }
}

@Serializable
data class CareerProposalDto(
    val uid: String = "",
    val status: String = "",
    @SerialName("created_at") val createdAt: String = "",
    val answer: CareerAnswerDto? = null,
    val decisions: List<CareerDecisionDto> = emptyList(),
)

@Serializable
internal data class CareerListDto(val proposals: List<CareerProposalDto> = emptyList())

@Serializable
data class CareerAnswerDto(
    val headline: String? = null,
    val subtitle: String? = null,
    val stats: List<CareerStatDto> = emptyList(),
    val followups: List<CareerFollowupDto> = emptyList(),
    val offers: List<CareerOfferDto> = emptyList(),
    val tasks: List<CareerTaskDto> = emptyList(),
)

/** Une valeur de tuile : le serveur envoie un nombre ou une chaîne. */
@Serializable
data class CareerStatDto(val label: String = "", val value: JsonElement = JsonNull)

@Serializable
data class CareerFollowupDto(
    val id: String = "",
    val title: String = "",
    val company: String? = null,
    @SerialName("applied_at") val appliedAt: String? = null,
    val note: String? = null,
    @SerialName("draft_url") val draftUrl: String? = null,
    @SerialName("source_url") val sourceUrl: String? = null,
)

@Serializable
data class CareerOfferDto(
    val id: String = "",
    val title: String = "",
    val company: String = "",
    val location: String? = null,
    val rate: String? = null,
    val url: String = "",
    val expires: String? = null,
    val fit: String = "",
    val source: String? = null,
)

@Serializable
data class CareerTaskDto(
    val id: String = "",
    val name: String = "",
    val note: String? = null,
    @SerialName("due_date") val dueDate: String? = null,
)

@Serializable
data class CareerDecisionDto(
    val kind: String = "",
    val id: String = "",
    val op: String = "",
    val note: String? = null,
    @SerialName("due_date") val dueDate: String? = null,
)

data class CareerStat(val label: String, val value: String)

data class CareerFollowup(
    val id: String,
    val title: String,
    val company: String?,
    val appliedAt: LocalDate?,
    val note: String?,
    val draftUrl: String?,
    val sourceUrl: String?,
)

data class CareerOffer(
    val id: String,
    val title: String,
    val company: String,
    val location: String?,
    val rate: String?,
    val url: String,
    val expires: LocalDate?,
    val fit: String,
    val source: String?,
)

data class CareerTask(val id: String, val name: String, val note: String?, val dueDate: LocalDate?)

/** Élément déjà décidé : affiché dans « Décidé (N) ». */
data class CareerDecided(val kind: CareerKind, val id: String, val title: String, val op: CareerOp, val note: String?)

data class CareerView(
    val headline: String?,
    val subtitle: String?,
    val stats: List<CareerStat>,
    val followups: List<CareerFollowup>,
    val offers: List<CareerOffer>,
    val tasks: List<CareerTask>,
    val decided: List<CareerDecided>,
) {
    /** « Rien de neuf aujourd'hui » : aucun élément ouvert ni décidé. */
    val isEmpty: Boolean get() = followups.isEmpty() && offers.isEmpty() && tasks.isEmpty() && decided.isEmpty()
}

/** Une décision valide pour son genre d'élément ; construite par [of], jamais à la main. */
data class CareerDecision(
    val kind: CareerKind,
    val id: String,
    val op: CareerOp,
    val note: String? = null,
    val dueDate: String? = null,
) {
    companion object {
        /** Null si l'opération ne va pas avec ce genre d'élément, ou si la date n'est pas une date. */
        fun of(kind: CareerKind, id: String, op: CareerOp, note: String? = null, dueDate: String? = null): CareerDecision? {
            if (id.isBlank() || op !in CareerModel.opsOf(kind)) return null
            val date = dueDate?.let { CareerModel.dateOrNull(it)?.toString() ?: return null }
            return CareerDecision(kind, id, op, CareerModel.noteOf(note), date)
        }
    }
}

/** Règles pures de la carrière : lecture de la liste, éléments ouverts et décidés, corps des requêtes. */
object CareerModel {
    /** Longueur maximale d'une remarque envoyée avec une décision. */
    const val NOTE_MAX_LENGTH = 500

    fun parseList(json: JsonObject): List<CareerProposalDto> =
        runCatching { ProposalJson.decodeFromJsonElement(CareerListDto.serializer(), json).proposals }.getOrDefault(emptyList())

    /** La plus récente des propositions prêtes ; une en préparation ou échouée n'est pas montrée. */
    fun newestReady(proposals: List<CareerProposalDto>): CareerProposalDto? =
        proposals.filter { ProposalStatus.of(it.status) == ProposalStatus.READY }.maxByOrNull { it.createdAt }

    /** Ce que l'écran montre : les éléments sans décision, puis ceux qui en ont une. */
    fun view(proposal: CareerProposalDto?): CareerView {
        val answer = proposal?.answer ?: return CareerView(null, null, emptyList(), emptyList(), emptyList(), emptyList(), emptyList())
        val decisions = proposal.decisions.associateBy { "${it.kind}:${it.id}" }
        val followups = answer.followups.filter { it.id.isNotBlank() }
        val offers = answer.offers.filter { it.id.isNotBlank() }
        val tasks = answer.tasks.filter { it.id.isNotBlank() }
        val decided = buildList {
            followups.forEach { f -> decidedOp(decisions, CareerKind.FOLLOWUP, f.id)?.let { (op, note) -> add(CareerDecided(CareerKind.FOLLOWUP, f.id, f.title, op, note)) } }
            offers.forEach { o -> decidedOp(decisions, CareerKind.OFFER, o.id)?.let { (op, note) -> add(CareerDecided(CareerKind.OFFER, o.id, o.title, op, note)) } }
            tasks.forEach { t -> decidedOp(decisions, CareerKind.TASK, t.id)?.let { (op, note) -> add(CareerDecided(CareerKind.TASK, t.id, t.name, op, note)) } }
        }
        return CareerView(
            headline = text(answer.headline),
            subtitle = text(answer.subtitle),
            stats = answer.stats.mapNotNull { stat ->
                val label = text(stat.label) ?: return@mapNotNull null
                CareerStat(label, (stat.value as? JsonPrimitive)?.content.orEmpty())
            },
            followups = followups.filter { decidedOp(decisions, CareerKind.FOLLOWUP, it.id) == null }.map {
                CareerFollowup(it.id, it.title, text(it.company), dateOrNull(it.appliedAt), text(it.note), safeUrl(it.draftUrl), safeUrl(it.sourceUrl))
            },
            offers = offers.filter { decidedOp(decisions, CareerKind.OFFER, it.id) == null }.map {
                CareerOffer(it.id, it.title, it.company, text(it.location), text(it.rate), it.url, dateOrNull(it.expires), it.fit, text(it.source))
            },
            tasks = tasks.filter { decidedOp(decisions, CareerKind.TASK, it.id) == null }.map {
                CareerTask(it.id, it.name, text(it.note), dateOrNull(it.dueDate))
            },
            decided = decided,
        )
    }

    /** Lien ouvrable : seulement http ou https, jamais un schéma que l'app ne sait pas servir. */
    fun safeUrl(raw: String?): String? {
        val url = text(raw) ?: return null
        return url.takeIf { it.startsWith("https://", ignoreCase = true) || it.startsWith("http://", ignoreCase = true) }
    }

    /** Remarque rognée à [NOTE_MAX_LENGTH] ; une remarque vide n'en est pas une. */
    fun noteOf(raw: String?): String? = text(raw)?.take(NOTE_MAX_LENGTH)

    /** Corps de `POST …/apply` : une seule décision. */
    fun applyBody(decision: CareerDecision): JsonObject = buildJsonObject {
        put(
            "decisions",
            buildJsonArray {
                add(buildJsonObject {
                    put("kind", decision.kind.wire)
                    put("id", decision.id)
                    put("op", decision.op.wire)
                    decision.note?.let { put("note", it) }
                    decision.dueDate?.let { put("due_date", it) }
                })
            },
        )
    }

    internal fun opsOf(kind: CareerKind): Set<CareerOp> = when (kind) {
        CareerKind.OFFER -> setOf(CareerOp.APPLY, CareerOp.SKIP, CareerOp.LATER)
        CareerKind.FOLLOWUP -> setOf(CareerOp.DONE, CareerOp.LATER, CareerOp.TASK)
        CareerKind.TASK -> setOf(CareerOp.CREATE, CareerOp.SKIP)
    }

    internal fun dateOrNull(value: String?): LocalDate? =
        text(value)?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }

    /** Une décision finale sort l'élément de la liste ouverte ; « Plus tard » le garde ouvert (le serveur fait de même). */
    private fun decidedOp(decisions: Map<String, CareerDecisionDto>, kind: CareerKind, id: String): Pair<CareerOp, String?>? {
        val decision = decisions["${kind.wire}:$id"] ?: return null
        val op = CareerOp.of(decision.op)?.takeIf { it in opsOf(kind) && it != CareerOp.LATER } ?: return null
        return op to noteOf(decision.note)
    }

    private fun text(raw: String?): String? = raw?.trim()?.takeIf { it.isNotEmpty() }
}
