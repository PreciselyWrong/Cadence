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
import ch.nicolab.cadence.data.local.entities.HabitQuickValueEntity
import ch.nicolab.cadence.data.local.entities.HabitReminderEntity
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitEvaluation
import ch.nicolab.cadence.domain.HabitEvaluator
import ch.nicolab.cadence.domain.HabitPause
import ch.nicolab.cadence.domain.PauseReason
import ch.nicolab.cadence.domain.PeriodCalculator
import ch.nicolab.cadence.ui.HabitFormatter
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.UUID
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
                // Une habitude sautée ou suspendue reste silencieuse, même sans rappel
                // conditionnel : la période est volontairement mise de côté.
                if (!evaluation.isPaused && (!reminder.conditional || evaluation.needsAttentionNow)) {
                    ReminderNotifications.show(
                        context = context,
                        habit = habit,
                        quickValue = app.repository.getQuickValues(habit.id).minOfOrNull(HabitQuickValueEntity::amountMinor),
                        message = if (reminder.conditional) {
                            ReminderNotifications.remainingMessage(habit, evaluation.progressMinor)
                        } else {
                            "Votre rappel est prêt"
                        },
                    )
                }
                ReminderScheduler.schedule(context, reminder)
            } finally {
                pending.finish()
            }
        }
    }
}

/** Les rappels d'abstinence invitent au bilan; les autres proposent une saisie directe. */
object ReminderNotifications {
    const val ACTION_DONE = "ch.nicolab.cadence.reminder.DONE"
    const val ACTION_ADD = "ch.nicolab.cadence.reminder.ADD"
    const val ACTION_SKIP = "ch.nicolab.cadence.reminder.SKIP"
    const val EXTRA_HABIT_ID = "habit_id"
    const val EXTRA_VALUE = "value_minor"

    /** Un binaire ne compte pas : il n'annonce jamais « il reste 1 ». */
    fun remainingMessage(habit: PersistedHabit, progressMinor: Long): String {
        if (habit.goal.goalType == GoalType.BINARY) return "À valider aujourd’hui"
        val remaining = (habit.goal.targetAt(LocalDate.now()) - progressMinor).coerceAtLeast(0)
        return "Il reste ${HabitFormatter.formatValue(remaining, habit.goal.goalType, habit.goal.unit)} ${habit.goal.unit?.symbol.orEmpty()}".trim()
    }

    internal fun allowsEntryAction(goal: HabitGoal): Boolean = !goal.isAbstinence

    fun notificationId(habitId: String): Int = habitId.hashCode()

    fun cancel(context: Context, habitId: String) {
        NotificationManagerCompat.from(context).cancel(notificationId(habitId))
    }

    fun show(context: Context, habit: PersistedHabit, quickValue: Long?, message: String) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val open = PendingIntent.getActivity(
            context,
            notificationId(habit.id),
            Intent(context, QuickEntryActivity::class.java).putExtra(QuickEntryActivity.EXTRA_HABIT_ID, habit.id),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = NotificationCompat.Builder(context, ReminderScheduler.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_widget_mark)
            .setContentTitle(habit.name)
            .setContentText(if (habit.goal.isAbstinence) context.getString(R.string.abstinence_reminder_check_in) else message)
            .setContentIntent(open)
            .setAutoCancel(true)
        if (allowsEntryAction(habit.goal)) {
            if (habit.goal.goalType == GoalType.BINARY) {
                builder.addAction(0, context.getString(R.string.notification_action_validate), action(context, habit.id, ACTION_DONE))
            } else {
                val increment = quickValue ?: habit.goal.unit?.scaleToCanonical ?: 1L
                builder.addAction(
                    0,
                    context.getString(
                        R.string.notification_action_add,
                        HabitFormatter.formatValue(increment, habit.goal.goalType, habit.goal.unit),
                    ),
                    action(context, habit.id, ACTION_ADD, increment),
                )
            }
        }
        builder.addAction(0, context.getString(R.string.notification_action_skip), action(context, habit.id, ACTION_SKIP))
        NotificationManagerCompat.from(context).notify(notificationId(habit.id), builder.build())
    }

    private fun action(context: Context, habitId: String, action: String, value: Long = 0L): PendingIntent {
        val intent = Intent(context, ReminderActionReceiver::class.java)
            .setAction(action)
            .putExtra(EXTRA_HABIT_ID, habitId)
            .putExtra(EXTRA_VALUE, value)
        return PendingIntent.getBroadcast(
            context,
            (habitId + action).hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}

/**
 * Applique une action de notification. L'application se reconstruit sur la révision des
 * saisies et des pauses; il reste à rafraîchir le widget et la notification elle-même.
 */
class ReminderActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val habitId = intent.getStringExtra(ReminderNotifications.EXTRA_HABIT_ID) ?: return
        val action = intent.action ?: return
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val repository = (context.applicationContext as CadenceApp).repository
                val today = LocalDate.now()
                val habit = repository.getHabitEffectiveAt(habitId, today)
                if (habit == null) {
                    ReminderNotifications.cancel(context, habitId)
                    return@launch
                }
                val zone = ZoneId.systemDefault()
                val evaluator = HabitEvaluator()
                fun window() = PeriodCalculator.window(today, habit.goal.period, habit.schedule.firstDayOfWeek)
                suspend fun evaluate(): HabitEvaluation {
                    val period = window()
                    val entries = repository.observeEntries(habit.id, period.start, period.endExclusive.minusDays(1)).first()
                    return evaluator.evaluate(habit.definition, today, entries, repository.observePauses(habit.id).first())
                }

                // Une habitude déjà terminée ou déjà sautée n'accepte plus l'action : la
                // notification disparaît simplement.
                if (evaluate().needsAttentionNow) {
                    when (action) {
                        ReminderNotifications.ACTION_DONE -> addEntry(repository, habit, habit.goal.targetAt(today), zone, today)
                        ReminderNotifications.ACTION_ADD -> addEntry(
                            repository,
                            habit,
                            intent.getLongExtra(ReminderNotifications.EXTRA_VALUE, 0L).takeIf { it > 0 } ?: return@launch,
                            zone,
                            today,
                        )
                        ReminderNotifications.ACTION_SKIP -> repository.addPause(
                            habit.id,
                            UUID.randomUUID().toString(),
                            HabitPause.skip(today, PauseReason.REST),
                        )
                    }
                }
                val updated = evaluate()
                if (updated.needsAttentionNow) {
                    ReminderNotifications.show(
                        context = context,
                        habit = habit,
                        quickValue = repository.getQuickValues(habit.id).minOfOrNull(HabitQuickValueEntity::amountMinor),
                        message = ReminderNotifications.remainingMessage(habit, updated.progressMinor),
                    )
                } else {
                    ReminderNotifications.cancel(context, habit.id)
                }
            } finally {
                pending.finish()
            }
        }
    }

    private suspend fun addEntry(
        repository: ch.nicolab.cadence.data.local.CadenceRepository,
        habit: PersistedHabit,
        valueMinor: Long,
        zone: ZoneId,
        today: LocalDate,
    ) {
        // Une ancienne notification peut rester affichée après le passage en abstinence.
        if (!ReminderNotifications.allowsEntryAction(habit.goal)) return
        val id = UUID.randomUUID().toString()
        repository.addEntry(
            HabitEntry(
                id = id,
                habitId = habit.id,
                occurredAt = java.time.Instant.now(),
                localDate = today,
                observedZoneId = zone,
                valueMinor = valueMinor,
                sessionId = id,
            ),
            source = "NOTIFICATION",
        )
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
                AbstinenceMilestoneScheduler.scheduleAll(context, repository)
            } finally {
                pending.finish()
            }
        }
    }
}
