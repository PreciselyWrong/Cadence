package ch.nicolab.cadence.widget.today

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.provider.CalendarContract
import androidx.glance.appwidget.updateAll
import ch.nicolab.cadence.CadenceApp
import kotlinx.coroutines.launch

/**
 * Redessine le widget « Aujourd'hui » quand le fournisseur d'agendas change, même app fermée :
 * un déclencheur de contenu JobScheduler remplace un ContentObserver qui mourrait avec le
 * processus. Le job est à usage unique, il se replanifie à chaque exécution.
 */
object TodayCalendarRefresh {
    private const val JOB_ID = 0x7DA1
    private const val UPDATE_DELAY_MS = 2_000L
    private const val MAX_DELAY_MS = 15_000L

    /** Sans effet si un job est déjà en attente : replanifier réinitialiserait ses déclencheurs. */
    fun ensureScheduled(context: Context) {
        val scheduler = context.getSystemService(JobScheduler::class.java) ?: return
        if (scheduler.getPendingJob(JOB_ID) != null) return
        schedule(context, scheduler)
    }

    internal fun schedule(context: Context, scheduler: JobScheduler = context.getSystemService(JobScheduler::class.java)) {
        val job = JobInfo.Builder(JOB_ID, ComponentName(context, TodayCalendarRefreshJobService::class.java))
            .addTriggerContentUri(
                JobInfo.TriggerContentUri(CalendarContract.CONTENT_URI, JobInfo.TriggerContentUri.FLAG_NOTIFY_FOR_DESCENDANTS),
            )
            .setTriggerContentUpdateDelay(UPDATE_DELAY_MS)
            .setTriggerContentMaxDelay(MAX_DELAY_MS)
            .build()
        // Sans READ_CALENDAR accordée, le système refuse le déclencheur : le widget reste alors
        // rafraîchi par les autres signaux, sans le suivi des agendas.
        runCatching { scheduler.schedule(job) }
    }

    fun cancel(context: Context) {
        context.getSystemService(JobScheduler::class.java)?.cancel(JOB_ID)
    }
}

class TodayCalendarRefreshJobService : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        TodayCalendarRefresh.schedule(this)
        val app = applicationContext as CadenceApp
        app.applicationScope.launch {
            TodayWidget().updateAll(app)
            jobFinished(params, false)
        }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean = false
}
