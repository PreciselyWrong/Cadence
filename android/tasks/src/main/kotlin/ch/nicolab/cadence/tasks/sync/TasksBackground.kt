package ch.nicolab.cadence.tasks.sync

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Bundle
import ch.nicolab.cadence.tasks.live.LiveStream
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch

/**
 * À appeler au démarrage de l'app : synchronisation périodique, passage immédiat, puis un passage à chaque
 * retour du réseau et à chaque retour de l'app au premier plan.
 */
object TasksBackground {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @OptIn(FlowPreview::class)
    fun start(context: Context) {
        SyncScheduler.schedulePeriodic(context)
        SyncScheduler.requestNow(context, restart = true)
        NetworkMonitor.start(context)
        // Notifications instantanées des agents : le service suit la connexion et son réglage.
        LiveStream.watch(context)
        (context.applicationContext as? Application)?.let(::watchForeground)
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

    private fun watchForeground(app: Application) {
        // Le premier démarrage vient d'en demander un : la porte ne rouvre qu'après l'intervalle.
        val gate = ForegroundGate(FOREGROUND_INTERVAL_MS, System::currentTimeMillis).apply { onStart(); onStop() }
        app.registerActivityLifecycleCallbacks(
            object : Application.ActivityLifecycleCallbacks {
                override fun onActivityStarted(activity: Activity) {
                    if (gate.onStart()) SyncScheduler.requestNow(app)
                    // L'app visible peut relancer le service du flux qu'Android aurait arrêté.
                    scope.launch { LiveStream.ensure(app) }
                }

                override fun onActivityStopped(activity: Activity) = gate.onStop()
                override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
                override fun onActivityResumed(activity: Activity) = Unit
                override fun onActivityPaused(activity: Activity) = Unit
                override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
                override fun onActivityDestroyed(activity: Activity) = Unit
            },
        )
    }

    private const val HABIT_DEBOUNCE_MS = 1_500L
    private const val FOREGROUND_INTERVAL_MS = 30_000L
}
