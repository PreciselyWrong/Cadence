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
        val periodic = inputData.getBoolean(KEY_PERIODIC, false)
        return when (workerOutcome(runtime.engine.sync(), periodic)) {
            WorkerOutcome.DONE -> Result.success()
            WorkerOutcome.RETRY -> Result.retry()
        }
    }

    companion object {
        const val KEY_PERIODIC = "periodic"
    }
}

internal enum class WorkerOutcome { DONE, RETRY }

/**
 * Un passage immédiat hors ligne ne réessaie pas : son recul exponentiel (jusqu'à 5 h)
 * retenait derrière lui chaque demande suivante de la chaîne. Le passage périodique s'en charge.
 */
internal fun workerOutcome(result: SyncResult, periodic: Boolean): WorkerOutcome = when (result) {
    is SyncResult.Offline -> if (periodic) WorkerOutcome.RETRY else WorkerOutcome.DONE
    SyncResult.Synced, SyncResult.Unauthorized, SyncResult.Closed -> WorkerOutcome.DONE
}
