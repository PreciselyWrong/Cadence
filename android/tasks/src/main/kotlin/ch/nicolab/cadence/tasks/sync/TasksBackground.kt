package ch.nicolab.cadence.tasks.sync

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch

/** À appeler au démarrage de l'app : synchronisation périodique et passage immédiat. */
object TasksBackground {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @OptIn(FlowPreview::class)
    fun start(context: Context) {
        SyncScheduler.schedulePeriodic(context)
        SyncScheduler.requestNow(context, restart = true)
        val habits = HabitSyncRegistry.storage ?: return
        // Une saisie d'habitude (écran, widget, rappel) laisse une écriture en attente : on demande un passage.
        scope.launch {
            var seen: Long? = null
            habits.observeLastChange().debounce(HABIT_DEBOUNCE_MS).collect { last ->
                val before = seen
                seen = last
                if (before != null && last > before) SyncScheduler.requestNow(context.applicationContext)
            }
        }
    }

    private const val HABIT_DEBOUNCE_MS = 1_500L
}
