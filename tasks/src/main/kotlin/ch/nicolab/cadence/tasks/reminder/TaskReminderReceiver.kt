package ch.nicolab.cadence.tasks.reminder

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.glance.appwidget.updateAll
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.reminder.TaskReminderScheduler.EXTRA_REMINDER_AT
import ch.nicolab.cadence.tasks.reminder.TaskReminderScheduler.EXTRA_TASK_UID
import ch.nicolab.cadence.tasks.ui.tasksLocale
import ch.nicolab.cadence.tasks.widget.TasksWidget
import ch.nicolab.cadence.tasks.widget.TasksWidgetUpdater
import ch.nicolab.cadence.tasks.widget.openTaskIntent
import ch.nicolab.cadence.tasks.widget.runAsync
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.flow.first

/** Reçoit l'alarme d'un rappel et l'action « Terminer » de sa notification. */
class TaskReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val uid = intent.getStringExtra(EXTRA_TASK_UID) ?: return
        when (intent.action) {
            TaskReminderScheduler.ACTION_REMINDER -> {
                val firedAt = intent.getLongExtra(EXTRA_REMINDER_AT, -1L)
                runAsync { showIfStillDue(context, uid, firedAt) }
            }
            ACTION_COMPLETE -> runAsync {
                TasksGraph.repository(context).completeTask(uid)
                TaskReminderNotifier.cancel(context, uid)
                // Terminer une récurrence déplace son rappel : il faut reposer les alarmes.
                TaskReminderScheduler.resync(context)
                TasksWidget().updateAll(context)
            }
        }
    }

    private suspend fun showIfStillDue(context: Context, uid: String, firedAt: Long) {
        val task = TasksGraph.repository(context).observeTask(uid).first() ?: return
        // Un rappel déplacé ou fermé depuis sa pose ne doit pas notifier : une autre alarme s'en charge.
        if (task.isClosed || task.reminderAt?.toEpochMilli() != firedAt) return
        TaskReminderNotifier.show(context, task)
    }

    companion object {
        internal const val ACTION_COMPLETE = "ch.nicolab.cadence.tasks.reminder.ACTION_COMPLETE"
    }
}

/** Reçoit le redémarrage de l'appareil ou la mise à jour de l'app : les alarmes disparaissent. */
class TaskReminderBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        runAsync {
            TaskReminderScheduler.resync(context)
            TasksWidgetUpdater.scheduleMidnight(context)
        }
    }
}

private const val NOTIFICATION_ID = 1

internal object TaskReminderNotifier {
    private val timeFormat = DateTimeFormatter.ofPattern("HH:mm")
    private val dateFormat = DateTimeFormatter.ofPattern("d MMM", tasksLocale)

    /** Vérifie la permission avant d'appeler [notify] : l'appel n'est pas protégé par la contrainte statique. */
    @SuppressLint("MissingPermission")
    fun show(context: Context, task: TaskItem) {
        if (!canPost(context)) return
        val builder = NotificationCompat.Builder(context, TaskReminderScheduler.CHANNEL_ID)
            .setSmallIcon(R.drawable.tasks_ic_notification)
            .setContentTitle(task.name)
            .setContentText(detail(context, task))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .addAction(0, context.getString(R.string.tasks_reminder_complete), completePendingIntent(context, task.uid))
        openTaskIntent(context, task.uid)?.let { open ->
            builder.setContentIntent(
                PendingIntent.getActivity(
                    context,
                    task.uid.hashCode(),
                    open,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )
        }
        NotificationManagerCompat.from(context).notify(task.uid, NOTIFICATION_ID, builder.build())
    }

    fun cancel(context: Context, uid: String) {
        NotificationManagerCompat.from(context).cancel(uid, NOTIFICATION_ID)
    }

    private fun canPost(context: Context): Boolean {
        val permitted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        return permitted && NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    private fun detail(context: Context, task: TaskItem): String {
        val due = task.dueDate ?: return context.getString(R.string.tasks_reminder_default_text)
        return if (task.dueHasTime) {
            context.getString(R.string.tasks_reminder_due_time, due.atZone(ZoneId.systemDefault()).format(timeFormat))
        } else {
            val day = task.dueDay ?: return context.getString(R.string.tasks_reminder_default_text)
            context.getString(R.string.tasks_reminder_due_date, day.format(dateFormat))
        }
    }

    private fun completePendingIntent(context: Context, uid: String): PendingIntent {
        val intent = Intent(context, TaskReminderReceiver::class.java)
            .setAction(TaskReminderReceiver.ACTION_COMPLETE)
            .setData(Uri.parse("tududi-reminder://complete/$uid"))
            .putExtra(EXTRA_TASK_UID, uid)
        return PendingIntent.getBroadcast(
            context,
            ("complete:$uid").hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
