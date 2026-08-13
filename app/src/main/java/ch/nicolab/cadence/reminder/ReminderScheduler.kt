package ch.nicolab.cadence.reminder

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import ch.nicolab.cadence.CadenceApp
import ch.nicolab.cadence.QuickEntryActivity
import ch.nicolab.cadence.R
import ch.nicolab.cadence.data.local.entities.HabitReminderEntity
import ch.nicolab.cadence.domain.HabitEvaluator
import ch.nicolab.cadence.domain.PeriodCalculator
import ch.nicolab.cadence.ui.HabitFormatter
import java.time.DayOfWeek
import java.time.Duration
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZonedDateTime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

object ReminderScheduler {
    const val CHANNEL_ID = "habit_reminders"
    private const val EXTRA_REMINDER_ID = "reminder_id"
    private const val WINDOW_MILLIS = 15 * 60 * 1000L

    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Rappels d’habitudes", NotificationManager.IMPORTANCE_DEFAULT),
            )
        }
    }

    fun schedule(context: Context, reminder: HabitReminderEntity, now: ZonedDateTime = ZonedDateTime.now()) {
        cancel(context, reminder.id)
        if (!reminder.enabled) return
        val trigger = nextTrigger(reminder, now)
        context.getSystemService(AlarmManager::class.java).setWindow(
            AlarmManager.RTC_WAKEUP,
            trigger.toInstant().toEpochMilli(),
            WINDOW_MILLIS,
            pendingIntent(context, reminder.id),
        )
    }

    fun cancel(context: Context, reminderId: String) {
        context.getSystemService(AlarmManager::class.java).cancel(pendingIntent(context, reminderId))
    }

    internal fun nextTrigger(reminder: HabitReminderEntity, now: ZonedDateTime): ZonedDateTime {
        val time = LocalTime.parse(reminder.time)
        val days = reminder.daysOfWeek.split(',').filter(String::isNotBlank).map(DayOfWeek::valueOf).toSet()
        return (0L..7L).asSequence()
            .map { now.toLocalDate().plusDays(it) }
            .filter { days.isEmpty() || it.dayOfWeek in days }
            .map { it.atTime(time).atZone(now.zone) }
            .first { it.isAfter(now) }
    }

    private fun pendingIntent(context: Context, reminderId: String): PendingIntent {
        val intent = Intent(context, ReminderReceiver::class.java).putExtra(EXTRA_REMINDER_ID, reminderId)
        return PendingIntent.getBroadcast(context, reminderId.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    internal fun reminderId(intent: Intent): String? = intent.getStringExtra(EXTRA_REMINDER_ID)
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val reminderId = ReminderScheduler.reminderId(intent) ?: return
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val app = context.applicationContext as CadenceApp
                val reminder = app.repository.getAllReminders().firstOrNull { it.id == reminderId } ?: return@launch
                val today = LocalDate.now()
                val habit = app.repository.getHabitEffectiveAt(reminder.habitId, today) ?: return@launch
                val window = PeriodCalculator.window(today, habit.goal.period, habit.schedule.firstDayOfWeek)
                val entries = app.repository.observeEntries(habit.id, window.start, window.endExclusive.minusDays(1)).first()
                val pauses = app.repository.observePauses(habit.id).first()
                val evaluation = HabitEvaluator().evaluate(habit.definition, today, entries, pauses)
                if (!reminder.conditional || evaluation.needsAttentionNow) {
                    val remaining = (habit.goal.targetMinor - evaluation.progressMinor).coerceAtLeast(0)
                    showNotification(context, habit.name, if (reminder.conditional) "Il reste ${HabitFormatter.formatValue(remaining, habit.goal.goalType, habit.goal.unit)} ${habit.goal.unit?.symbol.orEmpty()}".trim() else "Votre rappel est prêt")
                }
                ReminderScheduler.schedule(context, reminder)
            } finally {
                pending.finish()
            }
        }
    }

    private fun showNotification(context: Context, title: String, message: String) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val open = PendingIntent.getActivity(context, 0, Intent(context, QuickEntryActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, ReminderScheduler.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_widget_mark)
            .setContentTitle(title)
            .setContentText(message)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(title.hashCode(), notification)
    }
}

class ReminderBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_TIMEZONE_CHANGED && intent.action != Intent.ACTION_TIME_CHANGED) return
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val repository = (context.applicationContext as CadenceApp).repository
                repository.getAllReminders().forEach { ReminderScheduler.schedule(context, it) }
            } finally {
                pending.finish()
            }
        }
    }
}
