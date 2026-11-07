package ch.nicolab.cadence.tasks.autoclassify

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/** Le formulaire des réglages, tel que l'écran le tient : nombres et seuils en texte, saisis sans être validés. */
data class ClassifyForm(
    val enabled: Boolean,
    val notify: Boolean,
    val dryRun: Boolean,
    val model: String,
    val effort: String,
    val numbers: Map<String, String>,
    val thresholds: Map<String, String>,
    val excludedTags: String,
)

/** Le corps `PUT /auto-classify/settings` : seulement des types vérifiés ici, les bornes restent au serveur (400). */
object ClassifySettingsForm {
    val NUMBER_KEYS = listOf(
        "batch_size",
        "grace_seconds",
        "fetch_wait_minutes",
        "max_attempts",
        "context_cache_minutes",
        "suggestion_ttl_days",
        "daily_suggestion_limit",
        "log_retention_days",
        "max_tags",
        "summary_max_chars",
        "max_tokens",
    )
    val THRESHOLD_KEYS = listOf("project", "tags", "duration", "priority", "ask")
    val EFFORTS = listOf("", "minimal", "low", "medium", "high")

    /** Échec : `IllegalArgumentException` dont le message est la clé du premier champ mal saisi. */
    fun build(form: ClassifyForm): Result<JsonObject> {
        val numbers = mutableMapOf<String, Int>()
        for (key in NUMBER_KEYS) {
            numbers[key] = form.numbers[key]?.trim()?.toIntOrNull() ?: return invalid(key)
        }
        val thresholds = mutableMapOf<String, Double>()
        for (key in THRESHOLD_KEYS) {
            thresholds[key] = form.thresholds[key]?.trim()?.replace(',', '.')?.toDoubleOrNull() ?: return invalid(key)
        }
        return Result.success(
            buildJsonObject {
                put("enabled", form.enabled)
                put("notify", form.notify)
                put("mode", if (form.dryRun) "dry_run" else "write")
                put("model", form.model.trim())
                put("reasoning_effort", form.effort)
                numbers.forEach { (key, value) -> put(key, value) }
                put("thresholds", buildJsonObject { thresholds.forEach { (key, value) -> put(key, value) } })
                put("excluded_tags", JsonArray(excludedTags(form.excludedTags).map(::JsonPrimitive)))
            },
        )
    }

    /** Ce que le serveur renvoie, mis à plat pour le formulaire. */
    fun fromSettings(values: JsonObject): ClassifyForm {
        val thresholds = values["thresholds"] as? JsonObject ?: JsonObject(emptyMap())
        return ClassifyForm(
            enabled = values.boolean("enabled") ?: true,
            notify = values.boolean("notify") ?: true,
            dryRun = text(values, "mode") == "dry_run",
            model = text(values, "model"),
            effort = text(values, "reasoning_effort"),
            numbers = NUMBER_KEYS.associateWith { text(values, it) },
            thresholds = THRESHOLD_KEYS.associateWith { text(thresholds, it) },
            excludedTags = (values["excluded_tags"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.orEmpty().joinToString(", "),
        )
    }

    /** Liste saisie par virgules : sans espaces autour, sans vides ni doublons. */
    fun excludedTags(raw: String): List<String> = raw.split(',').map { it.trim() }.filter { it.isNotEmpty() }.distinct()

    private fun invalid(key: String): Result<JsonObject> = Result.failure(IllegalArgumentException(key))

    private fun text(source: JsonObject, key: String): String = (source[key] as? JsonPrimitive)?.contentOrNull.orEmpty()

}
