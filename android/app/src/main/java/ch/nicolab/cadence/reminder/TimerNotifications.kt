package ch.nicolab.cadence.reminder

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import ch.nicolab.cadence.QuickEntryActivity
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.R as DesignR
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.HabitTimer

/**
 * Notification persistante d'une séance chronométrée. Elle rend le chronomètre visible
 * hors de l'application et le rouvre d'un toucher, à l'endroit où il se pilote.
 *
 * Elle ne porte pas de compte à rebours propre : le temps se dérive de l'état du
 * chronomètre, la notification affiche son point de départ.
 */
object TimerNotifications {

    private fun notificationId(habitId: String): Int = habitId.hashCode() xor 0x7112

    fun show(context: Context, habit: PersistedHabit, timer: HabitTimer) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val running = timer.runningSince ?: return
        val open = PendingIntent.getActivity(
            context,
            notificationId(habit.id),
            Intent(context, QuickEntryActivity::class.java).putExtra(QuickEntryActivity.EXTRA_HABIT_ID, habit.id),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val startedAtRealtime = System.currentTimeMillis() - timer.accumulatedSeconds * 1_000 -
            (System.currentTimeMillis() - running.toEpochMilli())
        val builder = NotificationCompat.Builder(context, ReminderScheduler.CHANNEL_ID)
            .setSmallIcon(DesignR.drawable.ic_widget_mark)
            .setContentTitle(context.getString(R.string.timer_notification_title, habit.name))
            .setContentText(context.getString(R.string.timer_notification_text))
            .setContentIntent(open)
            .setOngoing(true)
            .setUsesChronometer(true)
            .setWhen(startedAtRealtime)
            .setOnlyAlertOnce(true)
        NotificationManagerCompat.from(context).notify(notificationId(habit.id), builder.build())
    }

    fun cancel(context: Context, habitId: String) {
        NotificationManagerCompat.from(context).cancel(notificationId(habitId))
    }
}
