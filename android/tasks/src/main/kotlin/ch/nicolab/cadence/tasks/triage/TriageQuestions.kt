package ch.nicolab.cadence.tasks.triage

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import ch.nicolab.cadence.tasks.sync.DeferredCall
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Question posée par une carte d'« À trier » ; la réponse vise [target]. */
@Serializable
data class QuestionDto(val key: String = "", val text: String = "", val target: TargetDto = TargetDto())

@Serializable
data class TargetDto(val scope: String = "", val ref: String = "")

/**
 * Réponse à une question (Oui, Non ou texte libre), mise en file avec sa clé d'idempotence. Le serveur prend le jour
 * local du compte : l'adresse ne porte pas de date.
 */
internal fun questionAnswerCall(
    idempotencyKey: String,
    question: QuestionDto,
    answer: String,
    label: String,
) = DeferredCall(
    key = "triage-answer:$idempotencyKey",
    method = "POST",
    path = ANSWERS_PATH,
    body = buildJsonObject {
        put("question_key", question.key)
        put("target", buildJsonObject {
            put("scope", question.target.scope)
            put("ref", question.target.ref)
        })
        put("answer", answer)
        put("idempotency_key", idempotencyKey)
    },
    label = label,
)

internal const val ANSWERS_PATH = "/api/v1/triage/answers"

/** Dernière file « À trier » lue, pour la lecture hors ligne. */
class TriageStore private constructor(private val prefs: SharedPreferences) {
    fun read(): String? = prefs.getString(KEY, null)

    fun write(json: String) = prefs.edit { putString(KEY, json) }

    companion object {
        private const val PREFS = "cadence_triage"
        private const val KEY = "triage"

        fun of(context: Context) = TriageStore(context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE))
    }
}
