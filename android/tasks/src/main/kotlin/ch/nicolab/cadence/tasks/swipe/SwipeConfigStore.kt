package ch.nicolab.cadence.tasks.swipe

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.edit
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/** Préférence des quatre actions de balayage, persistée dans `cadence_swipe`. */
class SwipeConfigStore(context: Context) {
    private val preferences: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun read(): SwipeConfig = SwipeConfig.decode(preferences.getString(KEY, null))

    fun write(config: SwipeConfig) {
        preferences.edit { putString(KEY, config.encode()) }
    }

    /** Émet la valeur courante puis chaque changement ; le listener vit tant que le collecteur. */
    fun changes(): Flow<SwipeConfig> = callbackFlow {
        send(read())
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> trySend(read()) }
        preferences.registerOnSharedPreferenceChangeListener(listener)
        awaitClose { preferences.unregisterOnSharedPreferenceChangeListener(listener) }
    }

    private companion object {
        const val PREFERENCES_NAME = "cadence_swipe"
        const val KEY = "config"
    }
}

@Composable
fun rememberSwipeConfigStore(): SwipeConfigStore {
    val context = LocalContext.current
    return remember(context) { SwipeConfigStore(context) }
}

/** Configuration courante, relue à chaque changement ; la première valeur est lue sans attendre. */
@Composable
fun rememberSwipeConfig(): SwipeConfig {
    val store = rememberSwipeConfigStore()
    val initial = remember(store) { store.read() }
    val config by produceState(initialValue = initial, store) {
        store.changes().collect { value = it }
    }
    return config
}
