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
        val kind = inputData.getString(KEY_KIND)?.let { runCatching { PassKind.valueOf(it) }.getOrNull() }
            ?: if (inputData.getBoolean(KEY_PERIODIC, false)) PassKind.PERIODIC else PassKind.NOW
        val result = runtime.engine.sync()
        if (result == SyncResult.Synced && kind != PassKind.RETRY) SyncScheduler.cancelRetry(applicationContext)
        return when (workerOutcome(result, kind)) {
            WorkerOutcome.DONE -> Result.success()
            WorkerOutcome.RETRY -> Result.retry()
            WorkerOutcome.SCHEDULE_RETRY -> {
                SyncScheduler.scheduleRetry(applicationContext)
                Result.success()
            }
        }
    }

    companion object {
        const val KEY_KIND = "kind"
        /** Données d'entrée des passages périodiques planifiés avant la 1.6.5. */
        const val KEY_PERIODIC = "periodic"
    }
}

/** D'où vient le passage : une demande (écriture, réseau revenu, premier plan), le rythme de 15 min, ou un nouvel essai. */
internal enum class PassKind { NOW, PERIODIC, RETRY }

internal enum class WorkerOutcome { DONE, RETRY, SCHEDULE_RETRY }

/**
 * Un passage immédiat manqué ne réessaie pas lui-même : son recul exponentiel (jusqu'à 5 h) retenait derrière
 * lui chaque demande suivante de la chaîne. Il confie le nouvel essai à la chaîne à part ([PassKind.RETRY]),
 * qui recule seule ; le passage périodique réessaie aussi.
 */
internal fun workerOutcome(result: SyncResult, kind: PassKind): WorkerOutcome = when (result) {
    is SyncResult.Offline, is SyncResult.Failed -> when (kind) {
        PassKind.NOW -> WorkerOutcome.SCHEDULE_RETRY
        PassKind.PERIODIC, PassKind.RETRY -> WorkerOutcome.RETRY
    }
    SyncResult.Synced, SyncResult.Unauthorized, SyncResult.Closed -> WorkerOutcome.DONE
}
