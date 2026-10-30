package ch.nicolab.cadence.tasks.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object SyncScheduler {
    private const val PERIODIC_NAME = "tududi-sync-periodic"
    private const val NOW_NAME = "tududi-sync-now"
    private val connected = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun schedulePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(PERIODIC_MINUTES, TimeUnit.MINUTES)
            .setConstraints(connected)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(PERIODIC_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    /** APPEND_OR_REPLACE : une écriture faite pendant un passage déclenche un nouveau passage après lui. */
    fun requestNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(connected).build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork(NOW_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    /** Attend la fin de l'annulation : un passage lancé par WorkManager ne doit pas survivre à la déconnexion. */
    suspend fun cancel(context: Context): Unit = withContext(Dispatchers.IO) {
        val manager = WorkManager.getInstance(context)
        manager.cancelUniqueWork(PERIODIC_NAME).result.get()
        manager.cancelUniqueWork(NOW_NAME).result.get()
    }

    private const val PERIODIC_MINUTES = 15L
}
