package ch.nicolab.cadence.tasks.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import ch.nicolab.cadence.tasks.data.TasksRuntime

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val runtime = TasksRuntime.get(applicationContext)
        // Sans serveur, il n'y a rien à faire : ce n'est pas une erreur à réessayer.
        if (runtime.connection.currentSession() == null) return Result.success()
        return when (runtime.engine.sync()) {
            SyncResult.Synced, SyncResult.Unauthorized -> Result.success()
            is SyncResult.Offline -> Result.retry()
        }
    }
}
