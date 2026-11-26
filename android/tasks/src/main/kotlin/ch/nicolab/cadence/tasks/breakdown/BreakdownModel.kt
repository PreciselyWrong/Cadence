package ch.nicolab.cadence.tasks.breakdown

import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.sync.HttpError
import ch.nicolab.cadence.tasks.sync.ProtocolError
import java.io.IOException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/** Pourquoi le serveur n'a pas proposé d'étapes (`reason` de `POST /task/:uid/breakdown`). */
enum class BreakdownReason {
    DISABLED, NOT_CONFIGURED, FAILED, EMPTY;

    companion object {
        fun of(wire: String?): BreakdownReason? = when (wire) {
            "disabled" -> DISABLED
            "not_configured" -> NOT_CONFIGURED
            "failed" -> FAILED
            "empty" -> EMPTY
            else -> null
        }
    }
}

/** Ce que l'écran dit d'un échec : pas de réseau, tâche refusée par le serveur (400, 403), ou autre panne. */
enum class BreakdownFailure { OFFLINE, REFUSED, FAILED }

data class ProposedStep(val name: String, val minutes: Int)

/** Réponse du serveur : des étapes (`source` ai) ou, sans réponse utilisable, de quoi écrire une première étape à la main. */
data class BreakdownProposal(val ai: Boolean, val reason: BreakdownReason?, val steps: List<ProposedStep>) {
    companion object {
        /** Une réponse illisible vaut un repli `FAILED` : la feuille propose alors d'écrire une étape, jamais d'erreur. */
        fun parse(body: JsonObject): BreakdownProposal {
            val steps = (body["steps"] as? JsonArray).orEmpty().mapNotNull { element ->
                val step = element as? JsonObject ?: return@mapNotNull null
                val name = Breakdown.clean((step["name"] as? JsonPrimitive)?.contentOrNull.orEmpty())
                if (name.isEmpty()) return@mapNotNull null
                val minutes = (step["minutes"] as? JsonPrimitive)?.contentOrNull?.toIntOrNull()
                ProposedStep(name, (minutes ?: Breakdown.DEFAULT_MINUTES).coerceIn(Breakdown.MIN_MINUTES, Breakdown.MAX_MINUTES))
            }
            val ai = (body["source"] as? JsonPrimitive)?.contentOrNull == "ai"
            if (ai && steps.isNotEmpty()) return BreakdownProposal(true, null, steps)
            val reason = BreakdownReason.of((body["reason"] as? JsonPrimitive)?.contentOrNull)
                ?: if (ai) BreakdownReason.EMPTY else BreakdownReason.FAILED
            return BreakdownProposal(false, reason, emptyList())
        }
    }
}

/** Une ligne de la liste éditée : [key] la désigne malgré les déplacements, [minutes] reste du texte tant qu'on le saisit. */
data class DraftStep(val key: Long, val name: String, val minutes: String)

data class BreakdownDraft(
    val steps: List<DraftStep>,
    /** Sans proposition de l'IA : une seule étape vide à écrire (« Première étape de 2 min ? »). */
    val fallback: Boolean,
    val reason: BreakdownReason?,
    internal val nextKey: Long,
)

/** Règles de la feuille « Découper en étapes » : édition de la liste, validation, total, corps de l'envoi. */
object Breakdown {
    const val MIN_MINUTES = 5
    const val MAX_MINUTES = 720
    const val MAX_STEPS = 50
    const val NAME_MAX = 200
    const val DEFAULT_MINUTES = 5

    enum class StepIssue { NAME, MINUTES }

    /** Le serveur refuse une sous-tâche (400) et une tâche de fichier TODO.md (403) ; une occurrence à venir n'existe pas encore. */
    fun canBreakDown(task: TaskItem): Boolean = task.parentTaskUid == null && !task.fileBacked && !task.virtual

    /** Une [HttpError] ou une [ProtocolError] vient d'un serveur joint : seule une autre erreur d'E/S est un manque de réseau. */
    fun failureOf(error: Throwable): BreakdownFailure = when {
        error is HttpError -> if (error.code == 400 || error.code == 403) BreakdownFailure.REFUSED else BreakdownFailure.FAILED
        error is ProtocolError -> BreakdownFailure.FAILED
        error is IOException -> BreakdownFailure.OFFLINE
        else -> BreakdownFailure.FAILED
    }

    /** Espaces réduits à un seul, comme le serveur. */
    internal fun clean(name: String): String = name.replace(Regex("\\s+"), " ").trim()

    fun draftOf(proposal: BreakdownProposal): BreakdownDraft {
        if (!proposal.ai) return BreakdownDraft(listOf(blank(0)), fallback = true, reason = proposal.reason, nextKey = 1)
        val steps = proposal.steps.mapIndexed { index, step -> DraftStep(index.toLong(), step.name, step.minutes.toString()) }
        return BreakdownDraft(steps, fallback = false, reason = null, nextKey = steps.size.toLong())
    }

    private fun blank(key: Long) = DraftStep(key, "", DEFAULT_MINUTES.toString())

    fun add(draft: BreakdownDraft): BreakdownDraft =
        if (draft.steps.size >= MAX_STEPS) draft else draft.copy(steps = draft.steps + blank(draft.nextKey), nextKey = draft.nextKey + 1)

    fun remove(draft: BreakdownDraft, key: Long): BreakdownDraft = draft.copy(steps = draft.steps.filterNot { it.key == key })

    fun rename(draft: BreakdownDraft, key: Long, name: String): BreakdownDraft = edit(draft, key) { it.copy(name = name) }

    fun setMinutes(draft: BreakdownDraft, key: Long, minutes: String): BreakdownDraft = edit(draft, key) { it.copy(minutes = minutes) }

    private fun edit(draft: BreakdownDraft, key: Long, change: (DraftStep) -> DraftStep) =
        draft.copy(steps = draft.steps.map { if (it.key == key) change(it) else it })

    /** [delta] -1 monte, +1 descend ; sans effet aux extrémités ou pour une clé inconnue. */
    fun move(draft: BreakdownDraft, key: Long, delta: Int): BreakdownDraft {
        val from = draft.steps.indexOfFirst { it.key == key }
        val to = from + delta
        if (from < 0 || delta == 0 || to !in draft.steps.indices) return draft
        val steps = draft.steps.toMutableList()
        steps.add(to, steps.removeAt(from))
        return draft.copy(steps = steps)
    }

    /** Une ligne sans nom est un emplacement : elle ne part pas et n'est jamais en défaut. */
    private fun used(step: DraftStep) = clean(step.name).isNotEmpty()

    /** Minutes saisies : vide = pas d'estimation (null) ; sinon un entier de 5 à 720. */
    private fun minutesOf(step: DraftStep): Result<Int?> {
        val text = step.minutes.trim()
        if (text.isEmpty()) return Result.success(null)
        val value = text.toIntOrNull()
        return if (value != null && value in MIN_MINUTES..MAX_MINUTES) Result.success(value) else Result.failure(IllegalArgumentException(text))
    }

    fun issueOf(step: DraftStep): StepIssue? = when {
        !used(step) -> null
        clean(step.name).length > NAME_MAX -> StepIssue.NAME
        minutesOf(step).isFailure -> StepIssue.MINUTES
        else -> null
    }

    /** Étapes qui seront créées. */
    fun count(draft: BreakdownDraft): Int = draft.steps.count(::used)

    /** Somme des minutes des étapes nommées dont la durée est valide. */
    fun total(draft: BreakdownDraft): Int = draft.steps.filter(::used).sumOf { minutesOf(it).getOrNull() ?: 0 }

    fun canApply(draft: BreakdownDraft): Boolean =
        count(draft) in 1..MAX_STEPS && draft.steps.none { issueOf(it) != null }

    /** Corps de `POST /task/:uid/breakdown/apply` ; échec si rien à créer ou si une étape est en défaut. */
    fun applyBody(draft: BreakdownDraft): Result<JsonObject> {
        if (!canApply(draft)) return Result.failure(IllegalArgumentException("steps"))
        val steps = draft.steps.filter(::used).map { step ->
            buildJsonObject {
                put("name", clean(step.name))
                val minutes = minutesOf(step).getOrNull()
                if (minutes == null) put("minutes", JsonNull) else put("minutes", minutes)
            }
        }
        return Result.success(buildJsonObject { put("steps", JsonArray(steps)) })
    }
}
