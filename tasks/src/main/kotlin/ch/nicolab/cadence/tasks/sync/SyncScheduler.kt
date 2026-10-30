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

    fun cancel(context: Context) {
        val manager = WorkManager.getInstance(context)
        manager.cancelUniqueWork(PERIODIC_NAME)
        manager.cancelUniqueWork(NOW_NAME)
    }

    private const val PERIODIC_MINUTES = 15L
}
