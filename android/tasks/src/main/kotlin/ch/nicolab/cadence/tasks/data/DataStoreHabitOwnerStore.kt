package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import ch.nicolab.cadence.tasks.sync.HabitOwnerState
import ch.nicolab.cadence.tasks.sync.HabitOwnerStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/** À part du DataStore de connexion : la déconnexion l'efface, le propriétaire des habitudes doit survivre. */
private val Context.habitOwnerStore by preferencesDataStore(name = "tududi_habit_owner")

private object OwnerKeys {
    val OWNER = stringPreferencesKey("owner")
    val CURRENT = stringPreferencesKey("current")
    val KEPT_LOCAL = stringPreferencesKey("kept_local")
}

internal class DataStoreHabitOwnerStore(private val context: Context) : HabitOwnerStore {
    override val state: Flow<HabitOwnerState> = context.habitOwnerStore.data.map { prefs ->
        HabitOwnerState(prefs[OwnerKeys.OWNER], prefs[OwnerKeys.CURRENT], prefs[OwnerKeys.KEPT_LOCAL])
    }

    override suspend fun update(change: (HabitOwnerState) -> HabitOwnerState) {
        context.habitOwnerStore.edit { prefs ->
            val next = change(HabitOwnerState(prefs[OwnerKeys.OWNER], prefs[OwnerKeys.CURRENT], prefs[OwnerKeys.KEPT_LOCAL]))
            put(prefs, OwnerKeys.OWNER, next.owner)
            put(prefs, OwnerKeys.CURRENT, next.current)
            put(prefs, OwnerKeys.KEPT_LOCAL, next.keptLocal)
        }
    }

    private fun put(prefs: MutablePreferences, key: Preferences.Key<String>, value: String?) {
        if (value == null) prefs.remove(key) else prefs[key] = value
    }
}
