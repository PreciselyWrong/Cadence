package ch.nicolab.cadence.tasks.reminder

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import ch.nicolab.cadence.domain.QuietPolicy
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Pose une alarme par rappel de tâche ouverte à approcher (rappel explicite, ou échéance horaire quand
 * [TimedReminders] est actif), et retire les notifications devenues fausses. Les alarmes sont exactes si
 * Android l'autorise, sinon une fenêtre de ±1 minute ([ReminderAlarms]).
 */
object TaskReminderScheduler {
    const val CHANNEL_ID = "tududi_task_reminders"
    internal const val ACTION_REMINDER = "ch.nicolab.cadence.tasks.reminder.ACTION_REMINDER"
    internal const val EXTRA_TASK_UID = "task_uid"
    internal const val EXTRA_REMINDER_AT = "reminder_at"
    internal const val ACTION_SNOOZED_REMINDER = "ch.nicolab.cadence.tasks.reminder.ACTION_SNOOZED_REMINDER"

    private const val PREFS = "tududi_reminders"
    /** Ancienne clé : une alarme par tâche, identifiée par son uid seul. */
    private const val KEY_LEGACY_SCHEDULED_UIDS = "scheduled_uids"
    private const val KEY_SCHEDULED_ALARMS = "scheduled_alarms"
    private const val KEY_DELIVERED = "delivered"
    private const val KEY_POSTED = "posted"
    // Reports « Plus tard » : locaux à l'appareil, jamais synchronisés.
    private const val KEY_SNOOZED = "snoozed"
    // Un rappel qui entre dans l'horizon sans modification de tâche doit tout de même être posé.
    private val RESCHEDULE_EVERY: Duration = Duration.ofHours(6)
    private val lock = Any()

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
            // La plage silencieuse du compte peut changer côté web, et le réglage des rappels à heure fixe sur le
            // téléphone : l'un et l'autre repose les alarmes comme une tâche modifiée.
            combine(
                TasksGraph.repository(app).observeTasks(),
                periodicTicks(),
                quietPolicies(app),
                TimedRemindersStore(app).changes(),
            ) { tasks, _, quiet, timed -> Triple(tasks, quiet, timed) }
                .collect { (tasks, quiet, timed) -> sync(app, tasks, Instant.now(), quiet, timed) }
        }
    }

    /** Aligne les alarmes sur la base courante : après démarrage ou après une écriture hors app. */
    suspend fun resync(context: Context) {
        sync(
            context,
            TasksGraph.repository(context).observeTasks().first(),
            Instant.now(),
            currentQuiet(context),
            TimedRemindersStore(context).read(),
        )
    }

    private fun quietPolicies(context: Context): Flow<QuietPolicy> =
        TasksGraph.connection(context).observe().map { it?.quiet ?: QuietPolicy.NONE }.distinctUntilChanged()

    internal suspend fun currentQuiet(context: Context): QuietPolicy =
        TasksGraph.connection(context).observe().first()?.quiet ?: QuietPolicy.NONE

    /**
     * « Plus tard » : repose une notification à [triggerAt] (déjà hors plage silencieuse, voir [TaskSnoozeRules]).
     * Le report est gardé localement pour survivre à un redémarrage ; [reminderAt] est le rappel d'origine.
     */
    internal fun snooze(context: Context, uid: String, reminderAt: Long, triggerAt: Instant) {
        val snooze = TaskSnooze(uid, reminderAt, triggerAt)
        synchronized(lock) {
            updateSet(context, KEY_SNOOZED) { TaskSnooze.replacing(it, snooze) }
            armSnooze(context, snooze)
        }
    }

    /** Le report a sonné (ou n'a plus lieu d'être) : on l'oublie. */
    internal fun clearSnooze(context: Context, uid: String) {
        synchronized(lock) {
            updateSet(context, KEY_SNOOZED) { TaskSnooze.without(it, uid) }
            cancelSnoozeAlarm(context, uid)
        }
    }

    /** Retire l'alarme de la clé [key] (`uid|repère`, voir [ReminderPlan.alarmKey]). */
    internal fun cancel(context: Context, key: String) {
        val pending = PendingIntent.getBroadcast(
            context,
            key.hashCode(),
            alarmIntent(context, key.substringBeforeLast('|'), key.substringAfterLast('|').toLongOrNull() ?: 0L),
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
        ) ?: return
        context.getSystemService(AlarmManager::class.java).cancel(pending)
        pending.cancel()
    }

    /** Avant l'identification par repère, l'alarme d'une tâche n'avait que son uid : on la retire encore. */
    private fun cancelLegacy(context: Context, uid: String) {
        val pending = PendingIntent.getBroadcast(
            context,
            uid.hashCode(),
            Intent(context, TaskReminderReceiver::class.java)
                .setAction(ACTION_REMINDER)
                .setData(Uri.parse("tududi-reminder://task/$uid"))
                .putExtra(EXTRA_TASK_UID, uid),
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
        ) ?: return
        context.getSystemService(AlarmManager::class.java).cancel(pending)
        pending.cancel()
    }

    /** Un rappel remis (ou ignoré car la tâche avait changé) ne doit plus être rattrapé. */
    internal fun recordDelivered(context: Context, uid: String, reminderAt: Instant) =
        updateSet(context, KEY_DELIVERED) { it + ReminderPlan.deliveryKey(uid, reminderAt) }

    internal fun recordPosted(context: Context, task: TaskItem) =
        updateSet(context, KEY_POSTED) { it + ReminderPlan.signature(task) }

    /** Vrai si une notification peut s'afficher : permission Android 13+ et réglage de l'app. */
    internal fun notificationsAllowed(context: Context): Boolean {
        val permitted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        return permitted && NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    private fun periodicTicks(): Flow<Unit> = flow {
        while (true) {
            emit(Unit)
            delay(RESCHEDULE_EVERY.toMillis())
        }
    }

    private fun sync(context: Context, tasks: List<TaskItem>, now: Instant, quiet: QuietPolicy, timed: TimedReminders) {
        synchronized(lock) {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val delivered = ReminderPlan.pruneDelivered(prefs.stringSet(KEY_DELIVERED), now)
            val storedSnoozes = prefs.stringSet(KEY_SNOOZED)
            val plan = ReminderPlan.alarms(
                tasks, delivered, prefs.stringSet(KEY_SCHEDULED_ALARMS), storedSnoozes, now, quiet, timed, ZoneId.systemDefault(),
            )
            prefs.stringSet(KEY_LEGACY_SCHEDULED_UIDS).forEach { cancelLegacy(context, it) }
            plan.staleReminders.forEach { cancel(context, it) }
            // Poser une alarme sur une clé existante la remplace : un rappel déplacé est mis à jour ainsi.
            plan.reminders.forEach { (key, alarm) ->
                ReminderAlarms.arm(
                    context,
                    alarm.triggerAt.toEpochMilli(),
                    alarmPendingIntent(context, key, alarm.uid, alarm.reminderAt.toEpochMilli()),
                )
            }
            plan.staleSnoozes.forEach { raw -> TaskSnooze.decode(raw)?.let { cancelSnoozeAlarm(context, it.uid) } }
            plan.snoozes.values.forEach { armSnooze(context, it) }

            val posted = prefs.stringSet(KEY_POSTED)
            val stale = ReminderPlan.staleNotifications(posted, tasks)
            val notifications = NotificationManagerCompat.from(context)
            stale.forEach { notifications.cancel(it.substringBefore('|'), NOTIFICATION_ID) }

            prefs.edit()
                .remove(KEY_LEGACY_SCHEDULED_UIDS)
                .putStringSet(KEY_SCHEDULED_ALARMS, plan.reminders.keys.toSet())
                .putStringSet(KEY_DELIVERED, delivered)
                .putStringSet(KEY_POSTED, posted - stale)
                .putStringSet(KEY_SNOOZED, storedSnoozes - plan.staleSnoozes)
                .apply()
        }
    }

    private fun updateSet(context: Context, key: String, transform: (Set<String>) -> Set<String>) {
        synchronized(lock) {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            prefs.edit().putStringSet(key, transform(prefs.stringSet(key))).apply()
        }
    }

    private fun SharedPreferences.stringSet(key: String): Set<String> =
        getStringSet(key, emptySet()).orEmpty().toSet()

    private fun alarmPendingIntent(context: Context, key: String, uid: String, markerMillis: Long): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            key.hashCode(),
            alarmIntent(context, uid, markerMillis).putExtra(EXTRA_REMINDER_AT, markerMillis),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun armSnooze(context: Context, snooze: TaskSnooze) {
        context.getSystemService(AlarmManager::class.java).setAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            snooze.triggerAt.toEpochMilli(),
            requireNotNull(snoozePendingIntent(context, snooze.uid, PendingIntent.FLAG_UPDATE_CURRENT, snooze.reminderAt)),
        )
    }

    private fun cancelSnoozeAlarm(context: Context, uid: String) {
        val pending = snoozePendingIntent(context, uid, PendingIntent.FLAG_NO_CREATE, 0L) ?: return
        context.getSystemService(AlarmManager::class.java).cancel(pending)
        pending.cancel()
    }

    private fun snoozePendingIntent(context: Context, uid: String, flag: Int, reminderAt: Long): PendingIntent? =
        PendingIntent.getBroadcast(
            context,
            "snooze:$uid".hashCode(),
            Intent(context, TaskReminderReceiver::class.java)
                .setAction(ACTION_SNOOZED_REMINDER)
                .setData(Uri.parse("tududi-reminder://snooze/$uid"))
                .putExtra(EXTRA_TASK_UID, uid)
                .putExtra(EXTRA_REMINDER_AT, reminderAt),
            flag or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun alarmIntent(context: Context, uid: String, markerMillis: Long): Intent =
        Intent(context, TaskReminderReceiver::class.java)
            .setAction(ACTION_REMINDER)
            .setData(Uri.parse("tududi-reminder://task/$uid/$markerMillis"))
            .putExtra(EXTRA_TASK_UID, uid)
}
