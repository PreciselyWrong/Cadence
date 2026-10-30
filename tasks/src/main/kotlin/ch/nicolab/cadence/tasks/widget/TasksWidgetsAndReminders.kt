package ch.nicolab.cadence.tasks.widget

import android.content.Context
import ch.nicolab.cadence.tasks.reminder.TaskReminderScheduler
import kotlinx.coroutines.CoroutineScope

/** Point d'entrée de l'app : démarre widgets et rappels de tâches une fois au lancement. */
object TasksWidgetsAndReminders {
    fun start(context: Context, scope: CoroutineScope) {
        val app = context.applicationContext
        TaskReminderScheduler.createChannel(app)
        TasksWidgetUpdater.start(app, scope)
        TaskReminderScheduler.start(app, scope)
    }
}
