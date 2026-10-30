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
import ch.nicolab.cadence.data.local.CadenceRepository
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.AbstinenceProfile
import ch.nicolab.cadence.domain.AlcoholConsumption
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

data class PlannedAlcoholFollowUp(
    val consumptionId: String,
    val habitId: String,
    val triggerAt: Instant,
)

/** Conserve la date locale choisie pour la relance afin que le changement de fuseau reste prévisible. */
object AlcoholFollowUpPlanner {
    val defaultTime: LocalTime = LocalTime.of(9, 0)

    fun plan(
        consumptionId: String,
        habitId: String,
        followUpDate: LocalDate?,
        standardDrinks: Int?,
        followUpNotified: Boolean,
        followUpTime: LocalTime,
        zoneId: ZoneId,
    ): PlannedAlcoholFollowUp? {
        if (standardDrinks != null || followUpDate == null || followUpNotified) return null
        return PlannedAlcoholFollowUp(
            consumptionId = consumptionId,
            habitId = habitId,
            triggerAt = followUpDate.atTime(followUpTime).atZone(zoneId).toInstant(),
        )
    }

    fun isDue(planned: PlannedAlcoholFollowUp, now: Instant): Boolean = !now.isBefore(planned.triggerAt)
}

object AlcoholFollowUpScheduler {
    const val CHANNEL_ID = "alcohol_follow_ups"
    const val EXTRA_HABIT_ID = "alcohol_follow_up_habit_id"
    const val EXTRA_CONSUMPTION_ID = "alcohol_follow_up_consumption_id"
    private const val WINDOW_MILLIS = 15 * 60 * 1000L

    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL_ID, context.getString(R.string.alcohol_follow_up_channel), NotificationManager.IMPORTANCE_DEFAULT),
            )
        }
    }

    fun schedule(
        context: Context,
        consumption: AlcoholConsumption,
        followUpTime: LocalTime,
        zoneId: ZoneId = ZoneId.systemDefault(),
        now: Instant = Instant.now(),
    ) {
        cancel(context, consumption.id, consumption.habitId)
        val planned = plan(consumption, followUpTime, zoneId) ?: return
        if (AlcoholFollowUpPlanner.isDue(planned, now)) return
        context.getSystemService(AlarmManager::class.java).setWindow(
            AlarmManager.RTC_WAKEUP,
            planned.triggerAt.toEpochMilli(),
            WINDOW_MILLIS,
            pendingIntent(context, planned.habitId, planned.consumptionId),
        )
    }

    suspend fun scheduleAll(
        context: Context,
        repository: CadenceRepository,
        zoneId: ZoneId = ZoneId.systemDefault(),
        now: Instant = Instant.now(),
    ) {
        repository.getHabitsEffectiveAt(LocalDate.now(zoneId)).forEach { habit ->
            val pauses = repository.getPauses(habit.id)
            repository.getAlcoholConsumptions(habit.id).forEach { consumption ->
                val planned = plan(consumption, habit.followUpTime(), zoneId)
                val followUpPaused = planned != null && pauses.any { it.includes(planned.triggerAt.atZone(zoneId).toLocalDate()) }
                if (!habit.isActiveAlcohol || followUpPaused) {
                    cancel(context, consumption.id, habit.id)
                    if (followUpPaused) {
                        repository.markAlcoholFollowUpNotified(consumption.id)
                    }
                    return@forEach
                }
                if (planned == null) {
                    cancel(context, consumption.id, habit.id)
                } else if (AlcoholFollowUpPlanner.isDue(planned, now)) {
                    deliver(context, repository, habit.id, consumption.id)
                } else {
                    schedule(context, consumption, habit.followUpTime(), zoneId, now)
                }
            }
        }
    }

    suspend fun deliver(context: Context, repository: CadenceRepository, habitId: String, consumptionId: String) {
        val zoneId = ZoneId.systemDefault()
        val habit = repository.getHabitEffectiveAt(habitId, LocalDate.now(zoneId))
        if (habit?.isActiveAlcohol != true) {
            cancel(context, consumptionId, habitId)
            return
        }
        val consumption = repository.getAlcoholConsumptions(habitId).firstOrNull { it.id == consumptionId }
        val planned = consumption?.let { plan(it, habit.followUpTime(), zoneId) }
        val followUpPaused = planned != null && repository.getPauses(habitId)
            .any { it.includes(planned.triggerAt.atZone(zoneId).toLocalDate()) }
        if (followUpPaused) {
            repository.markAlcoholFollowUpNotified(consumptionId)
            cancel(context, consumptionId, habitId)
            return
        }
        if (planned == null || !AlcoholFollowUpPlanner.isDue(planned, Instant.now())) {
            cancel(context, consumptionId, habitId)
            return
        }
        repository.markAlcoholFollowUpNotified(consumptionId)
        cancel(context, consumptionId, habitId)
        show(context, habit, consumptionId)
    }

    fun cancel(context: Context, consumptionId: String, habitId: String) {
        context.getSystemService(AlarmManager::class.java).cancel(pendingIntent(context, habitId, consumptionId))
    }

    private fun plan(consumption: AlcoholConsumption, followUpTime: LocalTime, zoneId: ZoneId): PlannedAlcoholFollowUp? =
        AlcoholFollowUpPlanner.plan(
            consumption.id,
            consumption.habitId,
            consumption.followUpDate,
            consumption.standardDrinks,
            consumption.followUpNotified,
            followUpTime,
            zoneId,
        )

    private fun PersistedHabit.followUpTime(): LocalTime =
        alcoholFollowUpTime?.let { raw -> runCatching { LocalTime.parse(raw) }.getOrNull() }
            ?: AlcoholFollowUpPlanner.defaultTime

    private val PersistedHabit.isActiveAlcohol: Boolean
        get() = active && !archived && abstinenceProfile == AbstinenceProfile.ALCOHOL

    private fun pendingIntent(context: Context, habitId: String, consumptionId: String): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            (habitId + consumptionId).hashCode(),
            Intent(context, AlcoholFollowUpReceiver::class.java)
                .setData(Uri.parse("cadence://alcohol-follow-up/$habitId/$consumptionId"))
                .putExtra(EXTRA_HABIT_ID, habitId)
                .putExtra(EXTRA_CONSUMPTION_ID, consumptionId),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun show(context: Context, habit: PersistedHabit, consumptionId: String) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        createChannel(context)
        val open = PendingIntent.getActivity(
            context,
            (habit.id + consumptionId).hashCode(),
            Intent(context, QuickEntryActivity::class.java)
                .putExtra(QuickEntryActivity.EXTRA_HABIT_ID, habit.id)
                .putExtra(QuickEntryActivity.EXTRA_ALCOHOL_CONSUMPTION_ID, consumptionId),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        NotificationManagerCompat.from(context).notify(
            ("alcohol-follow-up:" + consumptionId).hashCode(),
            NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_widget_mark)
                .setContentTitle(habit.name)
                .setContentText(context.getString(R.string.alcohol_follow_up_notification))
                .setContentIntent(open)
                .setAutoCancel(true)
                .build(),
        )
    }
}

class AlcoholFollowUpReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val habitId = intent.getStringExtra(AlcoholFollowUpScheduler.EXTRA_HABIT_ID) ?: return
        val consumptionId = intent.getStringExtra(AlcoholFollowUpScheduler.EXTRA_CONSUMPTION_ID) ?: return
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val repository = (context.applicationContext as CadenceApp).repository
                AlcoholFollowUpScheduler.deliver(context, repository, habitId, consumptionId)
            } finally {
                pending.finish()
            }
        }
    }
}
