package ch.nicolab.cadence.tasks.autoclassify

import android.content.Context
import ch.nicolab.cadence.tasks.data.TasksRuntime
import ch.nicolab.cadence.tasks.reminder.TaskReminderScheduler
import kotlinx.coroutines.CancellationException

/** Le dépôt du classement, câblé sur l'API et la file d'appels différés du processus. */
internal fun autoClassifyRepository(context: Context): AutoClassifyRepository {
    val runtime = TasksRuntime.get(context.applicationContext)
    return AutoClassifyRepository(runtime.api::call) { call -> runtime.repository.defer(call).getOrThrow() }
}

/**
 * Notifie les suggestions nouvelles après une synchro réussie. Une erreur ici ne fait jamais échouer la synchro :
 * la suggestion sera reprise au passage suivant.
 */
internal suspend fun notifyAutoClassify(context: Context) {
    val app = context.applicationContext
    try {
        AutoClassifyNotifier(
            app,
            autoClassifyRepository(app),
            AutoClassifyStore.of(app),
            quiet = { TaskReminderScheduler.currentQuiet(app) },
        ).notifyPending()
    } catch (error: CancellationException) {
        throw error
    } catch (_: Exception) {
        // Une notification annexe ne fait pas échouer la synchro.
    }
}
