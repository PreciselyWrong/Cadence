package ch.nicolab.cadence.tasks.reminder

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import ch.nicolab.cadence.domain.ReminderLead
import ch.nicolab.cadence.tasks.sync.HttpError
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long

/**
 * « Rappeler les tâches à heure fixe » : une tâche qui a une heure d'échéance et aucun rappel explicite sonne à
 * cette heure, [lead] avant. Activé et « à l'heure » par défaut. Un rappel explicite (`reminder_at`) l'emporte.
 */
data class TimedReminders(val enabled: Boolean = true, val lead: ReminderLead = ReminderLead.AT_TIME) {
    companion object {
        val OFF = TimedReminders(enabled = false)
    }
}

/** Dernière valeur gardée sur l'appareil, et si elle attend d'être envoyée au serveur. */
interface TimedRemindersCache {
    fun read(): TimedReminders
    fun pending(): Boolean
    fun save(settings: TimedReminders, pending: Boolean)
}

/**
 * Le serveur est la source du réglage (`/api/v1/notifications/timed-tasks`) : le client Linux sonne avec la même
 * avance que le téléphone. Une modification est gardée tout de suite sur l'appareil, puis envoyée ; sans serveur
 * joignable, elle part au passage de synchro suivant ([sync]). La dernière écriture l'emporte, comme sur le web.
 */
class TimedRemindersRepository internal constructor(
    private val cache: TimedRemindersCache,
    private val call: suspend (method: String, path: String, query: Map<String, String>, body: JsonObject?) -> JsonObject,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
) {
    private val mutex = Mutex()
    // Une réponse partie avant la dernière modification ne remplace pas celle-ci.
    private val edits = AtomicInteger()

    fun edit(settings: TimedReminders) {
        cache.save(settings, pending = true)
        edits.incrementAndGet()
        scope.launch { sync() }
    }

    /** Envoie ce qui attend, sinon relit le serveur. Hors ligne ou sans serveur, rien ne change. */
    suspend fun sync() = mutex.withLock {
        val seen = edits.get()
        try {
            val result = if (cache.pending()) {
                parse(call("PUT", PATH, emptyMap(), body(cache.read())))
            } else {
                parse(call("GET", PATH, emptyMap(), null))
            }
            if (seen == edits.get()) cache.save(result, pending = false)
        } catch (error: CancellationException) {
            throw error
        } catch (error: HttpError) {
            if (!error.isClientError) return@withLock
            // Refusée : la modification est abandonnée, le téléphone reprend la version du serveur.
            val server = runCatching { parse(call("GET", PATH, emptyMap(), null)) }.getOrNull()
            if (seen == edits.get()) cache.save(server ?: cache.read(), pending = false)
        } catch (_: Exception) {
            // Serveur injoignable ou absent : la modification reste à envoyer.
        }
    }

    private fun body(settings: TimedReminders) = JsonObject(
        mapOf("enabled" to JsonPrimitive(settings.enabled), "lead_minutes" to JsonPrimitive(settings.lead.minutes)),
    )

    private fun parse(json: JsonObject) = TimedReminders(
        enabled = json.getValue("enabled").jsonPrimitive.boolean,
        lead = ReminderLead.ofMinutes(json.getValue("lead_minutes").jsonPrimitive.long, ReminderLead.AT_TIME),
    )

    private companion object {
        const val PATH = "/api/v1/notifications/timed-tasks"
    }
}

/** Dernière lecture du réglage partagé (`cadence_task_reminders`). */
class TimedRemindersStore(context: Context) : TimedRemindersCache {
    private val preferences: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    override fun read(): TimedReminders = TimedReminders(
        enabled = preferences.getBoolean(KEY_ENABLED, true),
        lead = ReminderLead.ofMinutes(preferences.getLong(KEY_LEAD, 0L), ReminderLead.AT_TIME),
    )

    // Sans marque, un réglage choisi avant la synchro part une fois au serveur plutôt que d'être écrasé.
    override fun pending(): Boolean = preferences.getBoolean(
        KEY_PENDING,
        preferences.contains(KEY_ENABLED) || preferences.contains(KEY_LEAD),
    )

    override fun save(settings: TimedReminders, pending: Boolean) {
        preferences.edit {
            putBoolean(KEY_ENABLED, settings.enabled)
            putLong(KEY_LEAD, settings.lead.minutes)
            putBoolean(KEY_PENDING, pending)
        }
    }

    /** Émet la valeur courante puis chaque changement. */
    fun changes(): Flow<TimedReminders> = callbackFlow {
        send(read())
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> trySend(read()) }
        preferences.registerOnSharedPreferenceChangeListener(listener)
        awaitClose { preferences.unregisterOnSharedPreferenceChangeListener(listener) }
    }.distinctUntilChanged()

    private companion object {
        const val PREFERENCES_NAME = "cadence_task_reminders"
        const val KEY_ENABLED = "timed_enabled"
        const val KEY_LEAD = "timed_lead_minutes"
        const val KEY_PENDING = "timed_pending"
    }
}
