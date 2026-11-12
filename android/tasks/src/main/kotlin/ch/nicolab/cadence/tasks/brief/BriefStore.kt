package ch.nicolab.cadence.tasks.brief

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import java.time.LocalDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Dernière lecture des réglages du brief (lecture hors ligne) et interrupteur « résumé prêt », propre à l'appareil.
 * Un seul exemplaire par processus : la page des réglages et l'écran du résumé lisent les mêmes flux.
 */
class BriefStore private constructor(private val prefs: SharedPreferences) {
    private val _settings = MutableStateFlow(readSettings())
    val settings: StateFlow<JsonObject?> = _settings.asStateFlow()

    private val _notifyReady = MutableStateFlow(prefs.getBoolean(KEY_NOTIFY_READY, false))
    /** Notifier quand le résumé du matin est prêt ; réglé sur l'appareil seulement (la notification est locale). */
    val notifyReady: StateFlow<Boolean> = _notifyReady.asStateFlow()

    fun writeSettings(value: JsonObject) {
        prefs.edit { putString(KEY_SETTINGS, value.toString()) }
        _settings.value = value
    }

    fun setNotifyReady(enabled: Boolean) {
        prefs.edit { putBoolean(KEY_NOTIFY_READY, enabled) }
        _notifyReady.value = enabled
    }

    /** Décisions prises dans le résumé de [day] (« AAAA-MM-JJ »), à plat : ce que l'écran montre comme déjà fait. */
    fun readDecisions(day: String): Map<String, String> = prefs.getString(DECISIONS + day, null)?.let { raw ->
        runCatching { (Json.parseToJsonElement(raw) as JsonObject).mapValues { (_, value) -> (value as JsonPrimitive).content } }.getOrNull()
    }.orEmpty()

    /** Garde les décisions de [day] et oublie celles des jours de plus de [DECISION_DAYS] jours. */
    fun writeDecisions(day: String, entries: Map<String, String>) {
        val limit = runCatching { LocalDate.parse(day).minusDays(DECISION_DAYS) }.getOrNull()
        prefs.edit {
            if (entries.isEmpty()) remove(DECISIONS + day) else putString(DECISIONS + day, JsonObject(entries.mapValues { JsonPrimitive(it.value) }).toString())
            if (limit != null) {
                prefs.all.keys.filter { it.startsWith(DECISIONS) }.forEach { key ->
                    val stored = runCatching { LocalDate.parse(key.removePrefix(DECISIONS)) }.getOrNull()
                    if (stored == null || stored.isBefore(limit)) remove(key)
                }
            }
        }
    }

    private val _seen = MutableStateFlow(prefs.getStringSet(KEY_SEEN, null).orEmpty().toSet())
    /** Vues déjà ouvertes ([seenKey]) sur un client : Aujourd'hui ne les annonce plus. */
    val seen: StateFlow<Set<String>> = _seen.asStateFlow()

    /** Note l'ouverture de [view] pour [day] et oublie les jours anciens ; faux si elle était déjà connue. */
    fun markSeen(day: LocalDate, view: BriefView): Boolean {
        val key = seenKey(day, view)
        if (key in _seen.value) return false
        val limit = day.minusDays(DECISION_DAYS).toString()
        val next = _seen.value.filterTo(HashSet()) { it >= limit } + key
        prefs.edit { putStringSet(KEY_SEEN, next) }
        _seen.value = next
        return true
    }

    /** Dernière file « À trier » lue, pour la lecture hors ligne. */
    fun readTriage(): String? = prefs.getString(KEY_TRIAGE, null)

    fun writeTriage(json: String) = prefs.edit { putString(KEY_TRIAGE, json) }

    private fun readSettings(): JsonObject? = prefs.getString(KEY_SETTINGS, null)?.let { raw ->
        runCatching { Json.parseToJsonElement(raw) as JsonObject }.getOrNull()
    }

    companion object {
        private const val PREFS = "cadence_brief"
        private const val KEY_SETTINGS = "settings"
        private const val KEY_NOTIFY_READY = "notify_ready"
        private const val KEY_TRIAGE = "triage"
        private const val DECISIONS = "decisions:"
        private const val DECISION_DAYS = 3L
        private const val KEY_SEEN = "seen"

        fun seenKey(day: LocalDate, view: BriefView): String = "$day|${view.name}"

        fun of(context: Context): BriefStore = BriefStore(context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE))
    }
}
