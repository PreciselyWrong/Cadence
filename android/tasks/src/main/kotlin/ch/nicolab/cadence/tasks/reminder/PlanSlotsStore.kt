package ch.nicolab.cadence.tasks.reminder

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import ch.nicolab.cadence.tasks.planning.PlanBoard
import ch.nicolab.cadence.tasks.planning.PlanEntry
import ch.nicolab.cadence.tasks.planning.ServerPlan
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.JsonObject

/**
 * Dernière lecture du plan du jour du serveur pour les [PLAN_DAYS] jours à partir d'aujourd'hui, gardée sur
 * l'appareil : les alarmes en lisent les placements à heure, Aujourd'hui et Planifier les tâches placées.
 */
class PlanSlotsStore(context: Context) {
    private val preferences: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun entries(): List<PlanEntry> = ServerPlan.decode(preferences.getString(KEY_ENTRIES, null))

    /** Placements à heure ; avant la première lecture du plan complet, ceux gardés par l'ancienne version. */
    fun read(zone: ZoneId = ZoneId.systemDefault()): List<PlanSlot> =
        if (preferences.contains(KEY_ENTRIES)) {
            PlanSlots.of(entries(), zone)
        } else {
            PlanSlots.decode(preferences.getStringSet(KEY_SLOTS, emptySet()).orEmpty())
        }

    fun write(entries: List<PlanEntry>) = preferences.edit {
        putString(KEY_ENTRIES, ServerPlan.encode(entries))
        remove(KEY_SLOTS)
    }

    fun changes(): Flow<List<PlanSlot>> = updates().map { read() }.distinctUntilChanged()

    fun entryChanges(): Flow<List<PlanEntry>> = updates().map { entries() }.distinctUntilChanged()

    private fun updates(): Flow<Unit> = callbackFlow {
        send(Unit)
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> trySend(Unit) }
        preferences.registerOnSharedPreferenceChangeListener(listener)
        awaitClose { preferences.unregisterOnSharedPreferenceChangeListener(listener) }
    }

    private companion object {
        const val PREFERENCES_NAME = "cadence_plan_slots"
        const val KEY_SLOTS = "slots"
        const val KEY_ENTRIES = "entries"
    }
}

/** Jours du plan gardés sur l'appareil : ceux de la page Planifier. */
internal const val PLAN_DAYS = PlanBoard.DAYS

/**
 * Relit les plans des [PLAN_DAYS] jours à partir d'aujourd'hui après chaque synchro réussie, en parallèle : un
 * placement ajouté, déplacé ou retiré sur le web y arrive au passage suivant. Une lecture qui échoue garde la
 * précédente (tous les jours ou aucun).
 */
internal suspend fun refreshPlanSlots(
    store: PlanSlotsStore,
    call: suspend (method: String, path: String, query: Map<String, String>, body: JsonObject?) -> JsonObject,
    zone: ZoneId = ZoneId.systemDefault(),
) {
    val today = LocalDate.now(zone)
    val entries = runCatching {
        coroutineScope {
            (0 until PLAN_DAYS).map { offset ->
                val day = today.plusDays(offset.toLong())
                async { ServerPlan.parse(call("GET", "/api/v1/daily-plan", mapOf("date" to day.toString()), null)) }
            }.awaitAll().flatten()
        }
    }.getOrNull() ?: return
    store.write(entries)
}
