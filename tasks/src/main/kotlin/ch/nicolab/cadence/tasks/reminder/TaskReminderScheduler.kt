package ch.nicolab.cadence.tasks.reminder

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.Duration
import java.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch

/**
 * Pose une alarme par tâche ouverte dont le rappel est dans les 14 prochains jours.
 * Les alarmes sont approchées : elles n'exigent aucune permission d'alarme exacte.
 */
object TaskReminderScheduler {
    const val CHANNEL_ID = "tududi_task_reminders"
    internal const val ACTION_REMINDER = "ch.nicolab.cadence.tasks.reminder.ACTION_REMINDER"
    internal const val EXTRA_TASK_UID = "task_uid"
    internal const val EXTRA_REMINDER_AT = "reminder_at"

    private const val PREFS = "tududi_reminders"
    private const val KEY_SCHEDULED_UIDS = "scheduled_uids"
    private val HORIZON: Duration = Duration.ofDays(14)
    // Un rappel qui entre dans l'horizon sans modification de tâche doit tout de même être posé.
    private val RESCHEDULE_EVERY: Duration = Duration.ofHours(6)

    fun createChannel(context: Context) {
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.tasks_reminder_channel_name),
                NotificationManager.IMPORTANCE_DEFAULT,
            ),
        )
    }

    fun start(context: Context, scope: CoroutineScope) {
        val app = context.applicationContext
        scope.launch {
            combine(TasksGraph.repository(app).observeTasks(), periodicTicks()) { tasks, _ -> tasks }
                .collect { tasks -> sync(app, tasks, Instant.now()) }
        }
    }

    /** Aligne les alarmes sur la base courante : après démarrage ou après une écriture hors app. */
    suspend fun resync(context: Context) {
        sync(context, TasksGraph.repository(context).observeTasks().first(), Instant.now())
    }

    internal fun cancel(context: Context, uid: String) {
        val pending = PendingIntent.getBroadcast(
            context,
            uid.hashCode(),
            alarmIntent(context, uid),
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
        ) ?: return
        context.getSystemService(AlarmManager::class.java).cancel(pending)
        pending.cancel()
    }

    private fun periodicTicks(): Flow<Unit> = flow {
        while (true) {
            emit(Unit)
            delay(RESCHEDULE_EVERY.toMillis())
        }
    }

    private fun sync(context: Context, tasks: List<TaskItem>, now: Instant) {
        val horizon = now.plus(HORIZON)
        val wanted: Map<String, Instant> = tasks.asSequence()
            .filter { !it.isClosed }
            .mapNotNull { task ->
                task.reminderAt?.takeIf { it.isAfter(now) && !it.isAfter(horizon) }?.let { task.uid to it }
            }
            .toMap()

        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val previous = prefs.getStringSet(KEY_SCHEDULED_UIDS, emptySet()).orEmpty()
        val alarms = context.getSystemService(AlarmManager::class.java)
        previous.filterNot { it in wanted }.forEach { cancel(context, it) }
        // Poser une alarme sur une clé existante la remplace : un rappel déplacé est mis à jour ainsi.
        wanted.forEach { (uid, at) ->
            alarms.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                at.toEpochMilli(),
                alarmPendingIntent(context, uid, at.toEpochMilli()),
            )
        }
        prefs.edit().putStringSet(KEY_SCHEDULED_UIDS, wanted.keys.toSet()).apply()
    }

    private fun alarmPendingIntent(context: Context, uid: String, reminderAtMillis: Long): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            uid.hashCode(),
            alarmIntent(context, uid).putExtra(EXTRA_REMINDER_AT, reminderAtMillis),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun alarmIntent(context: Context, uid: String): Intent =
        Intent(context, TaskReminderReceiver::class.java)
            .setAction(ACTION_REMINDER)
            .setData(Uri.parse("tududi-reminder://task/$uid"))
            .putExtra(EXTRA_TASK_UID, uid)
}
