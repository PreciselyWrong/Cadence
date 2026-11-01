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
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import ch.nicolab.cadence.CadenceApp
import ch.nicolab.cadence.QuickEntryActivity
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.R as DesignR
import ch.nicolab.cadence.data.local.entities.HabitQuickValueEntity
import ch.nicolab.cadence.data.local.entities.HabitReminderEntity
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitEvaluation
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitEvaluator
import ch.nicolab.cadence.domain.HabitPause
import ch.nicolab.cadence.domain.PauseReason
import ch.nicolab.cadence.domain.PeriodCalculator
import ch.nicolab.cadence.domain.QuietPolicy
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.ui.HabitFormatter
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/** Pose et retire les alarmes de rappels d'habitudes ; l'implémentation Android est [AlarmManagerHabitSink]. */
internal interface HabitAlarmSink {
    fun set(reminderId: String, triggerAtEpochMilli: Long)
    fun cancel(reminderId: String)
}

internal object HabitReminderSync {
    /**
     * Aligne les alarmes sur [reminders] : les actifs sont (re)posés à leur prochaine heure, repoussée hors de la
     * plage silencieuse ; les désactivés et ceux de [previouslyArmed] qui ont disparu (supprimés par une synchro)
     * sont retirés. Retourne les identifiants maintenant armés.
     */
    fun apply(
        sink: HabitAlarmSink,
        reminders: List<HabitReminderEntity>,
        previouslyArmed: Set<String>,
        now: ZonedDateTime,
        quiet: QuietPolicy,
    ): Set<String> {
        val armed = reminders.filter { it.enabled }
        armed.forEach { sink.set(it.id, ReminderScheduler.triggerAt(it, now, quiet).toEpochMilli()) }
        val keep = armed.mapTo(HashSet()) { it.id }
        val gone = (previouslyArmed - keep) + reminders.filterNot { it.enabled }.map { it.id }
        gone.forEach(sink::cancel)
        return keep
    }
}

internal class AlarmManagerHabitSink(private val context: Context) : HabitAlarmSink {
    override fun set(reminderId: String, triggerAtEpochMilli: Long) {
        context.getSystemService(AlarmManager::class.java).setWindow(
            AlarmManager.RTC_WAKEUP,
            triggerAtEpochMilli,
            ReminderScheduler.WINDOW_MILLIS,
            ReminderScheduler.pendingIntent(context, reminderId),
        )
    }

    override fun cancel(reminderId: String) = ReminderScheduler.cancel(context, reminderId)
}

object ReminderScheduler {
    const val CHANNEL_ID = "habit_reminders"
    const val EXTRA_REMINDER_ID = "reminder_id"
    const val EXTRA_SNOOZE_TRIGGER_AT = "snooze_trigger_at"
    const val ACTION_DELIVER_SNOOZE = "ch.nicolab.cadence.reminder.DELIVER_SNOOZE"
    internal const val WINDOW_MILLIS = 15 * 60 * 1000L

    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Rappels d’habitudes", NotificationManager.IMPORTANCE_DEFAULT),
            )
        }
    }

    fun schedule(
        context: Context,
        reminder: HabitReminderEntity,
        now: ZonedDateTime = ZonedDateTime.now(),
        quiet: QuietPolicy = QuietPolicy.NONE,
    ) {
        HabitReminderSync.apply(AlarmManagerHabitSink(context), listOf(reminder), emptySet(), now, quiet)
    }

    /** Plage silencieuse du compte, gardée par la connexion au serveur ; aucune sans compte. */
    suspend fun quietPolicy(context: Context): QuietPolicy =
        TasksGraph.connection(context).observe().first()?.quiet ?: QuietPolicy.NONE

    /**
     * Repose tous les rappels : au démarrage de l'app, après une synchro qui en applique, et quand la plage
     * silencieuse change. Rejouer la liste est sans effet de bord (une clé existante est remplacée).
     */
    fun observeAndKeepScheduled(context: Context, repository: ch.nicolab.cadence.data.local.CadenceRepository, scope: CoroutineScope) {
        val sink = AlarmManagerHabitSink(context)
        scope.launch {
            var armed = emptySet<String>()
            combine(
                repository.observeAllReminders(),
                TasksGraph.connection(context).observe().map { it?.quiet ?: QuietPolicy.NONE }.distinctUntilChanged(),
            ) { reminders, quiet -> reminders to quiet }
                .collect { (reminders, quiet) -> armed = HabitReminderSync.apply(sink, reminders, armed, ZonedDateTime.now(), quiet) }
        }
    }

    @Synchronized
    fun snooze(
        context: Context,
        habitId: String,
        reminderId: String,
        now: ZonedDateTime = ZonedDateTime.now(),
        quiet: QuietPolicy = QuietPolicy.NONE,
    ) {
        cancelSnooze(context, habitId)
        val trigger = ReminderSnooze.nextTrigger(now)
        val triggerAtEpochMilli = quiet.shift(trigger.toInstant()).toEpochMilli()
        context.getSystemService(AlarmManager::class.java).setWindow(
            AlarmManager.RTC_WAKEUP,
            triggerAtEpochMilli,
            WINDOW_MILLIS,
            snoozePendingIntent(context, habitId, reminderId, triggerAtEpochMilli),
        )
        ReminderSnoozeStore.save(context, habitId, reminderId, triggerAtEpochMilli)
    }

    @Synchronized
    fun cancelSnooze(context: Context, habitId: String) {
        context.getSystemService(AlarmManager::class.java).cancel(snoozePendingIntent(context, habitId, "", 0L))
        ReminderSnoozeStore.remove(context, habitId)
    }

    suspend fun restorePendingSnoozes(
        context: Context,
        repository: ch.nicolab.cadence.data.local.CadenceRepository,
        now: Instant = Instant.now(),
    ) {
        val nowEpochMs = now.toEpochMilli()
        val reminders = repository.getAllReminders().associateBy { it.id }
        ReminderSnoozeStore.getAll(context).forEach { pending ->
            val reminder = reminders[pending.reminderId]
            if (pending.triggerAtEpochMilli > nowEpochMs && reminder != null && reminder.enabled && reminder.habitId == pending.habitId) {
                context.getSystemService(AlarmManager::class.java).setWindow(
                    AlarmManager.RTC_WAKEUP,
                    pending.triggerAtEpochMilli,
                    WINDOW_MILLIS,
                    snoozePendingIntent(context, pending.habitId, pending.reminderId, pending.triggerAtEpochMilli),
                )
            } else {
                ReminderSnoozeStore.remove(context, pending.habitId)
            }
        }
    }

    internal suspend fun handleSnoozeDelivery(
        context: Context,
        habitId: String,
        reminderId: String,
        triggerAtEpochMilli: Long,
    ) {
        if (!consumeSnooze(context, habitId, reminderId, triggerAtEpochMilli)) {
            return
        }
        val app = context.applicationContext as CadenceApp
        val repository = app.repository
        val reminder = repository.getAllReminders().firstOrNull { it.id == reminderId }
        val today = LocalDate.now()
        val habit = repository.getHabitEffectiveAt(habitId, today)
        val window = habit?.let { PeriodCalculator.window(today, it.goal.period, it.schedule.firstDayOfWeek) }
        val entries = habit?.let { repository.observeEntries(it.id, window!!.start, window.endExclusive.minusDays(1)).first() } ?: emptyList()
        val pauses = habit?.let { repository.observePauses(it.id).first() } ?: emptyList()
        val evaluation = habit?.let { HabitEvaluator().evaluate(it.definition, today, entries, pauses) }
        if (!ReminderSnooze.shouldDeliverSnooze(habit, reminder, evaluation)) {
            return
        }
        ReminderNotifications.show(
            context = context,
            habit = habit!!,
            quickValue = repository.getQuickValues(habit.id).minOfOrNull(HabitQuickValueEntity::amountMinor),
            message = if (reminder!!.conditional) {
                ReminderNotifications.remainingMessage(habit, evaluation!!.progressMinor)
            } else {
                context.getString(R.string.habit_reminder_ready)
            },
            reminderId = reminder.id,
        )
    }

    fun cancel(context: Context, reminderId: String) {
        context.getSystemService(AlarmManager::class.java).cancel(pendingIntent(context, reminderId))
    }

    @Synchronized
    private fun consumeSnooze(
        context: Context,
        habitId: String,
        reminderId: String,
        triggerAtEpochMilli: Long,
    ): Boolean {
        if (ReminderSnoozeStore.get(context, habitId) != PendingSnooze(habitId, reminderId, triggerAtEpochMilli)) {
            return false
        }
        ReminderSnoozeStore.remove(context, habitId)
        return true
    }

    /** Prochaine sonnerie, repoussée à la fin de la plage silencieuse du compte si elle y tombe. */
    internal fun triggerAt(reminder: HabitReminderEntity, now: ZonedDateTime, quiet: QuietPolicy): java.time.Instant =
        quiet.shift(nextTrigger(reminder, now).toInstant())

    internal fun nextTrigger(reminder: HabitReminderEntity, now: ZonedDateTime): ZonedDateTime {
        val time = LocalTime.parse(reminder.time)
        val days = reminder.daysOfWeek.split(',').filter(String::isNotBlank).map(DayOfWeek::valueOf).toSet()
        return (0L..7L).asSequence()
            .map { now.toLocalDate().plusDays(it) }
            .filter { days.isEmpty() || it.dayOfWeek in days }
            .map { it.atTime(time).atZone(now.zone) }
            .first { it.isAfter(now) }
    }

    internal fun pendingIntent(context: Context, reminderId: String): PendingIntent {
        val intent = Intent(context, ReminderReceiver::class.java).putExtra(EXTRA_REMINDER_ID, reminderId)
        return PendingIntent.getBroadcast(context, reminderId.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun snoozePendingIntent(
        context: Context,
        habitId: String,
        reminderId: String,
        triggerAtEpochMilli: Long,
    ): PendingIntent {
        val intent = Intent(context, ReminderReceiver::class.java)
            .setAction(ACTION_DELIVER_SNOOZE)
            .setData(Uri.parse("cadence://reminder/snooze/$habitId"))
            .putExtra(ReminderNotifications.EXTRA_HABIT_ID, habitId)
            .putExtra(EXTRA_REMINDER_ID, reminderId)
            .putExtra(EXTRA_SNOOZE_TRIGGER_AT, triggerAtEpochMilli)
        return PendingIntent.getBroadcast(
            context,
            ("snooze:" + habitId).hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    internal fun reminderId(intent: Intent): String? = intent.getStringExtra(EXTRA_REMINDER_ID)
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                if (intent.action == ReminderScheduler.ACTION_DELIVER_SNOOZE) {
                    val habitId = intent.getStringExtra(ReminderNotifications.EXTRA_HABIT_ID) ?: return@launch
                    val reminderId = intent.getStringExtra(ReminderScheduler.EXTRA_REMINDER_ID) ?: return@launch
                    val triggerAtEpochMilli = intent.getLongExtra(ReminderScheduler.EXTRA_SNOOZE_TRIGGER_AT, -1L)
                    if (triggerAtEpochMilli <= 0L) return@launch
                    ReminderScheduler.handleSnoozeDelivery(context, habitId, reminderId, triggerAtEpochMilli)
                    return@launch
                }
                val reminderId = ReminderScheduler.reminderId(intent) ?: return@launch
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
                        message = if (habit.goal.isTracker) {
                            context.getString(R.string.tracker_reminder_message)
                        } else if (reminder.conditional) {
                            ReminderNotifications.remainingMessage(habit, evaluation.progressMinor)
                        } else {
                            context.getString(R.string.habit_reminder_ready)
                        },
                        reminderId = reminder.id,
                    )
                }
                ReminderScheduler.schedule(context, reminder, quiet = ReminderScheduler.quietPolicy(context))
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
    const val ACTION_SNOOZE = "ch.nicolab.cadence.reminder.SNOOZE"
    const val ACTION_SKIP = "ch.nicolab.cadence.reminder.SKIP"
    const val EXTRA_HABIT_ID = "habit_id"
    const val EXTRA_VALUE = "value_minor"

    /** Un binaire ne compte pas : il n'annonce jamais « il reste 1 ». */
    fun remainingMessage(habit: PersistedHabit, progressMinor: Long): String {
        if (habit.goal.goalType == GoalType.BINARY) return "À valider aujourd’hui"
        val remaining = (habit.goal.targetAt(LocalDate.now()) - progressMinor).coerceAtLeast(0)
        val formatted = HabitFormatter.formatValue(remaining, habit.goal.goalType, habit.goal.unit)
        val suffix = if (habit.goal.goalType == GoalType.DURATION || habit.goal.unit?.symbol.isNullOrBlank()) {
            ""
        } else {
            " ${habit.goal.unit?.symbol?.trim()}"
        }
        return "Il reste $formatted$suffix".trim()
    }

    internal fun allowsEntryAction(goal: HabitGoal): Boolean = !goal.isAbstinence

    /** Une notification d'action n'a plus de raison d'être quand rien n'est attendu. */
    internal fun shouldCancel(evaluation: HabitEvaluation): Boolean = !evaluation.needsAttentionNow

    fun notificationId(habitId: String): Int = habitId.hashCode()

    fun cancel(context: Context, habitId: String) {
        NotificationManagerCompat.from(context).cancel(notificationId(habitId))
    }

    fun show(
        context: Context,
        habit: PersistedHabit,
        quickValue: Long?,
        message: String,
        reminderId: String? = null,
    ) {
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
            .setSmallIcon(DesignR.drawable.ic_widget_mark)
            .setContentTitle(habit.name)
            .setContentText(if (habit.goal.isAbstinence) context.getString(R.string.abstinence_reminder_check_in) else message)
            .setContentIntent(open)
            .setAutoCancel(true)
        if (allowsEntryAction(habit.goal)) {
            if (habit.goal.goalType == GoalType.BINARY) {
                builder.addAction(0, context.getString(R.string.notification_action_validate), action(context, habit.id, ACTION_DONE, reminderId = reminderId))
            } else {
                val increment = quickValue ?: habit.goal.unit?.scaleToCanonical ?: 1L
                builder.addAction(
                    0,
                    context.getString(
                        R.string.notification_action_add,
                        HabitFormatter.formatValue(increment, habit.goal.goalType, habit.goal.unit),
                    ),
                    action(context, habit.id, ACTION_ADD, increment, reminderId = reminderId),
                )
            }
        }
        if (!habit.goal.isTracker) {
            builder.addAction(0, context.getString(R.string.notification_action_snooze), action(context, habit.id, ACTION_SNOOZE, reminderId = reminderId))
            builder.addAction(0, context.getString(R.string.notification_action_skip), action(context, habit.id, ACTION_SKIP, reminderId = reminderId))
        }
        NotificationManagerCompat.from(context).notify(notificationId(habit.id), builder.build())
    }

    private fun action(
        context: Context,
        habitId: String,
        action: String,
        value: Long = 0L,
        reminderId: String? = null,
    ): PendingIntent {
        val intent = Intent(context, ReminderActionReceiver::class.java)
            .setAction(action)
            .setData(Uri.parse("cadence://reminder/action/$action/$habitId"))
            .putExtra(EXTRA_HABIT_ID, habitId)
            .putExtra(EXTRA_VALUE, value)
        if (reminderId != null) {
            intent.putExtra(ReminderScheduler.EXTRA_REMINDER_ID, reminderId)
        }
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
                    ReminderScheduler.cancelSnooze(context, habitId)
                    return@launch
                }
                if (action == ReminderNotifications.ACTION_SNOOZE) {
                    ReminderNotifications.cancel(context, habitId)
                    val reminderId = intent.getStringExtra(ReminderScheduler.EXTRA_REMINDER_ID)
                        ?: repository.getAllReminders().firstOrNull { it.habitId == habitId && it.enabled }?.id
                    if (reminderId != null) {
                        ReminderScheduler.snooze(context, habitId, reminderId, quiet = ReminderScheduler.quietPolicy(context))
                    }
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
                        ReminderNotifications.ACTION_DONE -> {
                            addEntry(repository, habit, habit.goal.targetAt(today), zone, today)
                            ReminderScheduler.cancelSnooze(context, habit.id)
                        }
                        ReminderNotifications.ACTION_ADD -> {
                            addEntry(
                                repository,
                                habit,
                                intent.getLongExtra(ReminderNotifications.EXTRA_VALUE, 0L).takeIf { it > 0 } ?: return@launch,
                                zone,
                                today,
                            )
                            ReminderScheduler.cancelSnooze(context, habit.id)
                        }
                        ReminderNotifications.ACTION_SKIP -> {
                            repository.addPause(
                                habit.id,
                                UUID.randomUUID().toString(),
                                HabitPause.skip(today, PauseReason.REST),
                            )
                            ReminderScheduler.cancelSnooze(context, habit.id)
                        }
                    }
                }
                val updated = evaluate()
                if (updated.needsAttentionNow) {
                    val reminderId = intent.getStringExtra(ReminderScheduler.EXTRA_REMINDER_ID)
                        ?: repository.getAllReminders().firstOrNull { it.habitId == habit.id && it.enabled }?.id
                    ReminderNotifications.show(
                        context = context,
                        habit = habit,
                        quickValue = repository.getQuickValues(habit.id).minOfOrNull(HabitQuickValueEntity::amountMinor),
                        message = ReminderNotifications.remainingMessage(habit, updated.progressMinor),
                        reminderId = reminderId,
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

/** Les alarmes disparaissent au redémarrage, à la mise à jour de l'app et se décalent quand l'heure ou le fuseau change. */
class ReminderBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!handles(intent.action)) return
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val repository = (context.applicationContext as CadenceApp).repository
                val quiet = ReminderScheduler.quietPolicy(context)
                repository.getAllReminders().forEach { ReminderScheduler.schedule(context, it, quiet = quiet) }
                AbstinenceMilestoneScheduler.scheduleAll(context, repository)
                AlcoholFollowUpScheduler.scheduleAll(context, repository)
                LearnedQuestionScheduler.scheduleAll(context, (context.applicationContext as CadenceApp).learnedQuestions)
                ReminderScheduler.restorePendingSnoozes(context, repository)
                EventReminderScheduler.resync(context)
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        private val ACTIONS = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIMEZONE_CHANGED,
            Intent.ACTION_TIME_CHANGED,
            // L'utilisateur vient d'accorder (ou de retirer) les alarmes exactes : on repose les alarmes en conséquence.
            AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED,
        )

        internal fun handles(action: String?): Boolean = action in ACTIONS
    }
}
