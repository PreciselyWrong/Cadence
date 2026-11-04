package ch.nicolab.cadence.tasks.brief

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

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

    private fun readSettings(): JsonObject? = prefs.getString(KEY_SETTINGS, null)?.let { raw ->
        runCatching { Json.parseToJsonElement(raw) as JsonObject }.getOrNull()
    }

    companion object {
        private const val PREFS = "cadence_brief"
        private const val KEY_SETTINGS = "settings"
        private const val KEY_NOTIFY_READY = "notify_ready"

        fun of(context: Context): BriefStore = BriefStore(context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE))
    }
}
