package ch.nicolab.cadence.tasks.breakdown

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/** Le formulaire des réglages de « Découper en étapes », nombres saisis en texte. */
data class BreakdownForm(val enabled: Boolean, val model: String, val numbers: Map<String, String>)

/**
 * Corps de `PUT /breakdown/settings`. Les bornes sont celles du serveur (`backend/modules/breakdown/settings.js`),
 * vérifiées ici pour nommer le champ fautif ; le serveur reste l'autorité (400).
 */
object BreakdownSettingsForm {
    val BOUNDS: Map<String, IntRange> = linkedMapOf(
        "max_steps" to 2..15,
        "min_step_minutes" to 5..60,
        "max_step_minutes" to 5..240,
        "note_chars" to 0..10000,
        "max_tokens" to 200..8000,
    )
    val NUMBER_KEYS: List<String> = BOUNDS.keys.toList()
    const val MODEL_MAX = 200

    /** Échec : `IllegalArgumentException` dont le message est la clé du premier champ mal saisi. */
    fun build(form: BreakdownForm): Result<JsonObject> {
        val numbers = mutableMapOf<String, Int>()
        for ((key, range) in BOUNDS) {
            val value = form.numbers[key]?.trim()?.toIntOrNull()
            if (value == null || value !in range) return invalid(key)
            numbers[key] = value
        }
        val model = form.model.trim()
        if (model.length > MODEL_MAX) return invalid("model")
        if (numbers.getValue("min_step_minutes") > numbers.getValue("max_step_minutes")) return invalid("min_step_minutes")
        return Result.success(
            buildJsonObject {
                put("enabled", form.enabled)
                put("model", model)
                numbers.forEach { (key, value) -> put(key, value) }
            },
        )
    }

    fun fromSettings(values: JsonObject): BreakdownForm = BreakdownForm(
        enabled = (values["enabled"] as? JsonPrimitive)?.booleanOrNull ?: true,
        model = text(values, "model"),
        numbers = NUMBER_KEYS.associateWith { text(values, it) },
    )

    private fun invalid(key: String): Result<JsonObject> = Result.failure(IllegalArgumentException(key))

    private fun text(source: JsonObject, key: String): String = (source[key] as? JsonPrimitive)?.contentOrNull.orEmpty()
}
