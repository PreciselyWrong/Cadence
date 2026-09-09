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
import ch.nicolab.cadence.AbstinenceGuide
import ch.nicolab.cadence.AbstinenceMilestone
import ch.nicolab.cadence.CadenceApp
import ch.nicolab.cadence.QuickEntryActivity
import ch.nicolab.cadence.R
import ch.nicolab.cadence.data.local.CadenceRepository
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.AbstinenceElapsedCalculator
import ch.nicolab.cadence.domain.AbstinenceProfile
import ch.nicolab.cadence.domain.HabitEntry
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

data class PlannedAbstinenceMilestone(val milestone: AbstinenceMilestone, val triggerAt: Instant)

object AbstinenceMilestonePlanner {
    fun next(profile: AbstinenceProfile, activeStart: Instant, now: Instant): PlannedAbstinenceMilestone? =
        AbstinenceGuide.milestones(profile).asSequence()
            .filter(AbstinenceMilestone::scientific)
            .map { PlannedAbstinenceMilestone(it, activeStart.plus(Duration.ofDays(it.days))) }
            .firstOrNull { it.triggerAt > now }

    fun isReachedNow(milestone: AbstinenceMilestone, activeStart: Instant, now: Instant): Boolean =
        !now.isBefore(activeStart.plus(Duration.ofDays(milestone.days)))
}

object AbstinenceMilestoneScheduler {
    const val CHANNEL_ID = "abstinence_milestones"
    private const val EXTRA_HABIT_ID = "habit_id"
    private const val EXTRA_DAYS = "milestone_days"
    private const val EXTRA_TRIGGER_AT = "trigger_at"
    private const val WINDOW_MILLIS = 15 * 60 * 1000L

    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL_ID, context.getString(R.string.abst_milestone_channel), NotificationManager.IMPORTANCE_DEFAULT),
            )
        }
    }

    suspend fun scheduleAll(context: Context, repository: CadenceRepository, now: Instant = Instant.now()) {
        repository.getHabitsEffectiveAt(LocalDate.now()).forEach { habit ->
            schedule(context, habit, if (habit.goal.isAbstinence) repository.getEntries(habit.id) else emptyList(), now)
        }
    }

    fun schedule(context: Context, habit: PersistedHabit, entries: List<HabitEntry>, now: Instant = Instant.now()) {
        cancel(context, habit.id)
        val declaredStart = habit.abstinenceStartedAt ?: return
        if (!habit.goal.isAbstinence || !habit.active || habit.archived) return
        val activeStart = AbstinenceElapsedCalculator.activeStart(habit.id, declaredStart, entries)
        val planned = AbstinenceMilestonePlanner.next(habit.abstinenceProfile, activeStart, now) ?: return
        context.getSystemService(AlarmManager::class.java).setWindow(
            AlarmManager.RTC_WAKEUP,
            planned.triggerAt.toEpochMilli(),
            WINDOW_MILLIS,
            intent(context, habit.id, planned.milestone.days, planned.triggerAt),
        )
    }

    fun cancel(context: Context, habitId: String) {
        context.getSystemService(AlarmManager::class.java).cancel(intent(context, habitId, 0, Instant.EPOCH))
    }

    internal fun habitId(intent: Intent) = intent.getStringExtra(EXTRA_HABIT_ID)
    internal fun days(intent: Intent) = intent.getLongExtra(EXTRA_DAYS, 0)
    internal fun triggerAt(intent: Intent) = Instant.ofEpochMilli(intent.getLongExtra(EXTRA_TRIGGER_AT, 0))

    private fun intent(context: Context, habitId: String, days: Long, triggerAt: Instant): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            habitId.hashCode(),
            Intent(context, AbstinenceMilestoneReceiver::class.java)
                .putExtra(EXTRA_HABIT_ID, habitId)
                .putExtra(EXTRA_DAYS, days)
                .putExtra(EXTRA_TRIGGER_AT, triggerAt.toEpochMilli()),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
}

class AbstinenceMilestoneReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val habitId = AbstinenceMilestoneScheduler.habitId(intent) ?: return
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val app = context.applicationContext as CadenceApp
                val habit = app.repository.getHabitEffectiveAt(habitId, LocalDate.now()) ?: return@launch
                val entries = app.repository.getEntries(habitId)
                val declaredStart = habit.abstinenceStartedAt ?: return@launch
                val activeStart = AbstinenceElapsedCalculator.activeStart(habitId, declaredStart, entries)
                val milestone = AbstinenceGuide.milestones(habit.abstinenceProfile)
                    .firstOrNull { it.scientific && it.days == AbstinenceMilestoneScheduler.days(intent) }
                val expectedTrigger = milestone?.let { activeStart.plus(Duration.ofDays(it.days)) }
                if (milestone != null && expectedTrigger == AbstinenceMilestoneScheduler.triggerAt(intent) &&
                    AbstinenceMilestonePlanner.isReachedNow(milestone, activeStart, Instant.now())) {
                    show(context, habit, milestone)
                }
                AbstinenceMilestoneScheduler.schedule(context, habit, entries)
            } finally {
                pending.finish()
            }
        }
    }

    private fun show(context: Context, habit: PersistedHabit, milestone: AbstinenceMilestone) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val open = PendingIntent.getActivity(
            context,
            habit.id.hashCode(),
            Intent(context, QuickEntryActivity::class.java).putExtra(QuickEntryActivity.EXTRA_HABIT_ID, habit.id),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val detail = context.getString(milestone.detail)
        val notification = NotificationCompat.Builder(context, AbstinenceMilestoneScheduler.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_widget_mark)
            .setContentTitle(context.getString(R.string.abst_milestone_reached, milestone.days))
            .setContentText(detail)
            .setStyle(NotificationCompat.BigTextStyle().bigText(detail))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify((habit.id + milestone.days).hashCode(), notification)
    }
}
