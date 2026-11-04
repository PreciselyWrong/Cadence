package ch.nicolab.cadence.tasks.brief.audio

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import ch.nicolab.cadence.tasks.data.TasksRuntime

/** Prépare l'audio du résumé du jour en arrière-plan (rendu local ou copie du MP3 du serveur). */
class BriefAudioWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        TasksRuntime.get(applicationContext).briefAudio.prepare(active = { !isStopped })
        return Result.success()
    }
}

object BriefAudioScheduler {
    const val UNIQUE_NAME = "brief-audio"

    /**
     * À appeler après chaque rafraîchissement du résumé. KEEP : un rendu en cours n'est jamais interrompu par la
     * synchro suivante, et un passage qui n'a rien à faire (fichier à jour) est presque gratuit.
     */
    fun request(context: Context) {
        val request = OneTimeWorkRequestBuilder<BriefAudioWorker>().build()
        WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_NAME, ExistingWorkPolicy.KEEP, request)
    }
}
