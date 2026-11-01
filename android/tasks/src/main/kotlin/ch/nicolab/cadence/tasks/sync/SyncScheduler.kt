package ch.nicolab.cadence.tasks.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object SyncScheduler {
    private const val PERIODIC_NAME = "tududi-sync-periodic"
    private const val NOW_NAME = "tududi-sync-now"
    private const val RETRY_NAME = "tududi-sync-retry"
    private val connected = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun schedulePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(PERIODIC_MINUTES, TimeUnit.MINUTES)
            .setConstraints(connected)
            .setInputData(workDataOf(SyncWorker.KEY_KIND to PassKind.PERIODIC.name))
            .build()
        // UPDATE garde le rythme en cours mais applique les nouvelles données d'entrée.
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(PERIODIC_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    /**
     * APPEND_OR_REPLACE : une écriture faite pendant un passage déclenche un nouveau passage après lui.
     * [restart] repart d'une chaîne neuve, pour purger au démarrage une chaîne restée en recul.
     */
    fun requestNow(context: Context, restart: Boolean = false) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(connected)
            .setInputData(workDataOf(SyncWorker.KEY_KIND to PassKind.NOW.name))
            .build()
        val policy = if (restart) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.APPEND_OR_REPLACE
        WorkManager.getInstance(context).enqueueUniqueWork(NOW_NAME, policy, request)
    }

    /**
     * Après un passage immédiat manqué (serveur injoignable ou en erreur) : une chaîne à part réessaie avec un
     * recul exponentiel (30 s, 1 min, 2 min…) tant que le réseau est là. KEEP garde le recul en cours ; elle ne
     * retient jamais la chaîne immédiate, qui reste libre pour chaque nouvelle écriture.
     */
    fun scheduleRetry(context: Context) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(connected)
            .setInitialDelay(RETRY_FIRST_SECONDS, TimeUnit.SECONDS)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, RETRY_FIRST_SECONDS, TimeUnit.SECONDS)
            .setInputData(workDataOf(SyncWorker.KEY_KIND to PassKind.RETRY.name))
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(RETRY_NAME, ExistingWorkPolicy.KEEP, request)
    }

    /** Un passage a réussi : le prochain échec repart du premier palier de recul. */
    fun cancelRetry(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(RETRY_NAME)
    }

    /** Attend la fin de l'annulation : un passage lancé par WorkManager ne doit pas survivre à la déconnexion. */
    suspend fun cancel(context: Context): Unit = withContext(Dispatchers.IO) {
        val manager = WorkManager.getInstance(context)
        manager.cancelUniqueWork(PERIODIC_NAME).result.get()
        manager.cancelUniqueWork(NOW_NAME).result.get()
        manager.cancelUniqueWork(RETRY_NAME).result.get()
    }

    private const val PERIODIC_MINUTES = 15L
    private const val RETRY_FIRST_SECONDS = 30L
}
