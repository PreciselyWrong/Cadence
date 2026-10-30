package ch.nicolab.cadence.tasks.sync

import android.content.Context

/** À appeler au démarrage de l'app : synchronisation périodique et passage immédiat. */
object TasksBackground {
    fun start(context: Context) {
        SyncScheduler.schedulePeriodic(context)
        SyncScheduler.requestNow(context)
    }
}
