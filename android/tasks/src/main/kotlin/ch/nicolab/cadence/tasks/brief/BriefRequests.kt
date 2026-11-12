package ch.nicolab.cadence.tasks.brief

import ch.nicolab.cadence.tasks.sync.DeferredCall
import java.time.LocalDate
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Appels du brief hors protocole de synchro, mis en file ([DeferredCall]). Chaque action a sa clé d'idempotence
 * (UUID choisi par le téléphone) : le serveur rend la même réponse si l'appel part deux fois.
 */
internal object BriefRequests {
    private const val DECISION_PREFIX = "brief-decision"
    private const val ANSWER_PREFIX = "brief-answer"
    private const val CARRY_PREFIX = "brief-carry"
    private const val SETTINGS_KEY = "brief-settings"

    fun decisionKey(idempotencyKey: String) = "$DECISION_PREFIX:$idempotencyKey"
    fun answerKey(idempotencyKey: String) = "$ANSWER_PREFIX:$idempotencyKey"
    fun carryKey(idempotencyKey: String) = "$CARRY_PREFIX:$idempotencyKey"

    /** Première ouverture d'une vue (`POST /daily-plan/:date/brief/seen`) : le serveur garde la première heure reçue. */
    fun seen(date: LocalDate, view: BriefView) = DeferredCall(
        key = "brief-seen:$date:${view.name}",
        method = "POST",
        path = "/api/v1/daily-plan/$date/brief/seen",
        body = buildJsonObject { put("view", view.name.lowercase()) },
        label = "Résumé : ouvert",
    )

    /**
     * Ajoute des tâches au plan de [day] (`POST /daily-plan/:date/carry-over`). Le serveur saute celles déjà au plan :
     * un deuxième envoi ne change rien, la clé sert à retirer l'appel tant qu'il n'est pas parti.
     */
    fun carryOver(day: LocalDate, idempotencyKey: String, taskUids: List<String>, label: String) = DeferredCall(
        key = carryKey(idempotencyKey),
        method = "POST",
        path = "/api/v1/daily-plan/$day/carry-over",
        body = buildJsonObject { put("task_uids", JsonArray(taskUids.map { JsonPrimitive(it) })) },
        label = label,
    )

    /**
     * Corps de `PUT /daily-plan/:date` qui garde le plan lu sans [removed] : le serveur remplace tout le plan, on renvoie
     * donc les autres lignes telles quelles (tâche, heure, durée). Null quand rien n'est à retirer.
     */
    fun planWithout(planResponse: JsonObject, removed: Collection<String>): JsonObject? {
        val items = ((planResponse["plan"] as? JsonObject)?.get("items") as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()
        val kept = items.filter { (it["task_uid"] as? JsonPrimitive)?.content !in removed }
        if (kept.size == items.size) return null
        return buildJsonObject {
            put("items", JsonArray(kept.map { item ->
                buildJsonObject {
                    put("task_uid", item["task_uid"] ?: JsonNull)
                    put("start_minute", item["start_minute"] ?: JsonNull)
                    put("duration_minutes", item["duration_minutes"] ?: JsonNull)
                }
            }))
        }
    }

    fun decision(
        date: LocalDate,
        idempotencyKey: String,
        kind: String,
        decision: String,
        targetType: String,
        targetRef: String,
        fingerprint: String?,
        proposal: JsonObject?,
        label: String,
    ) = DeferredCall(
        key = decisionKey(idempotencyKey),
        method = "POST",
        path = "/api/v1/daily-plan/$date/brief/decisions",
        body = buildJsonObject {
            put("kind", kind)
            put("decision", decision)
            put("target_type", targetType)
            put("target_ref", targetRef)
            fingerprint?.let { put("fingerprint", it) }
            proposal?.let { put("proposal", it) }
            put("idempotency_key", idempotencyKey)
        },
        label = label,
    )

    fun answer(
        date: LocalDate,
        idempotencyKey: String,
        questionKey: String,
        scope: String,
        ref: String,
        answer: String,
        label: String,
    ) = DeferredCall(
        key = answerKey(idempotencyKey),
        method = "POST",
        path = "/api/v1/daily-plan/$date/brief/answers",
        body = buildJsonObject {
            put("question_key", questionKey)
            put("target", buildJsonObject {
                put("scope", scope)
                put("ref", ref)
            })
            put("answer", answer)
            put("idempotency_key", idempotencyKey)
        },
        label = label,
    )

    /** Réglages du brief : la dernière écriture remplace les précédentes (le corps complet est renvoyé). */
    fun settings(body: JsonObject) = DeferredCall(
        key = SETTINGS_KEY,
        method = "PUT",
        path = "/api/v1/daily-plan/brief/settings",
        body = body,
        label = "Réglages du résumé",
    )

    internal fun proposalOf(move: MoveProposal): JsonObject = buildJsonObject {
        put("from", JsonPrimitive(move.from))
        put("to", JsonPrimitive(move.to))
    }
}

/** Ce qu'une proposition de déplacement porte : sa date d'origine et sa date proposée. */
internal data class MoveProposal(val from: String, val to: String)
