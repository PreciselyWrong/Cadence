package ch.nicolab.cadence.tasks.reminder

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.serialization.json.JsonObject

/** Dernière lecture des placements à heure du plan d'aujourd'hui et de demain, gardée sur l'appareil. */
class PlanSlotsStore(context: Context) {
    private val preferences: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun read(): List<PlanSlot> = PlanSlots.decode(preferences.getStringSet(KEY_SLOTS, emptySet()).orEmpty())

    fun write(slots: List<PlanSlot>) = preferences.edit { putStringSet(KEY_SLOTS, PlanSlots.encode(slots)) }

    fun changes(): Flow<List<PlanSlot>> = callbackFlow {
        send(read())
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> trySend(read()) }
        preferences.registerOnSharedPreferenceChangeListener(listener)
        awaitClose { preferences.unregisterOnSharedPreferenceChangeListener(listener) }
    }.distinctUntilChanged()

    private companion object {
        const val PREFERENCES_NAME = "cadence_plan_slots"
        const val KEY_SLOTS = "slots"
    }
}

/**
 * Relit les plans d'aujourd'hui et de demain après chaque synchro réussie : un placement ajouté, déplacé ou retiré
 * sur le web y arrive au passage suivant. Une lecture qui échoue garde la précédente.
 */
internal suspend fun refreshPlanSlots(
    store: PlanSlotsStore,
    call: suspend (method: String, path: String, query: Map<String, String>, body: JsonObject?) -> JsonObject,
    zone: ZoneId = ZoneId.systemDefault(),
) {
    val today = LocalDate.now(zone)
    val slots = runCatching {
        listOf(today, today.plusDays(1)).flatMap { day ->
            PlanSlots.parse(call("GET", "/api/v1/daily-plan", mapOf("date" to day.toString()), null), zone)
        }
    }.getOrNull() ?: return
    store.write(slots)
}
