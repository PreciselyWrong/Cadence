package ch.nicolab.cadence.tasks.focus

import android.content.Context
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * État du minuteur de concentration, gardé sur l'appareil seulement (jamais synchronisé).
 * Un seul minuteur existe à la fois ; il survit à la fermeture de la fiche et au redémarrage
 * du processus, puisque [PomodoroState] se dérive de l'horloge.
 */
class FocusTimerStore private constructor(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val _state = MutableStateFlow(PomodoroState.decode(prefs.getString(KEY_STATE, null)))
    val state: StateFlow<PomodoroState> = _state.asStateFlow()

    /** Démarre ou reprend, pour [taskUid] ; changer de tâche repart d'une concentration neuve. */
    fun start(taskUid: String, nowMs: Long = System.currentTimeMillis()) =
        update { current ->
            val base = if (current.taskUid == taskUid) current else PomodoroState.idle().copy(taskUid = taskUid)
            base.start(nowMs)
        }

    fun pause(nowMs: Long = System.currentTimeMillis()) = update { it.pause(nowMs) }

    fun advance() = update { it.advance() }

    fun reset() = update { it.reset() }

    private fun update(change: (PomodoroState) -> PomodoroState) {
        val next = change(_state.value)
        _state.value = next
        prefs.edit { putString(KEY_STATE, next.encode()) }
    }

    companion object {
        private const val PREFS = "tududi_focus_timer"
        private const val KEY_STATE = "state"

        @Volatile
        private var instance: FocusTimerStore? = null

        fun get(context: Context): FocusTimerStore =
            instance ?: synchronized(this) { instance ?: FocusTimerStore(context).also { instance = it } }
    }
}
