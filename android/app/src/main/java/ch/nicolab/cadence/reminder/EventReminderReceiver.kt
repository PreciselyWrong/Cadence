package ch.nicolab.cadence.reminder

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.glance.appwidget.updateAll
import ch.nicolab.cadence.MainActivity
import ch.nicolab.cadence.R
import ch.nicolab.cadence.calendar.CalendarGraph
import ch.nicolab.cadence.calendar.CalendarSurface
import ch.nicolab.cadence.calendar.EventReminders
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.calendar.TimeRange
import ch.nicolab.cadence.calendar.eventKeyOfToken
import ch.nicolab.cadence.calendar.localStart
import ch.nicolab.cadence.designsystem.R as DesignR
import ch.nicolab.cadence.widget.today.TodayWidget
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/** Reçoit l'alarme d'un événement ou d'un résumé, l'action « Fait » de la notification et le rafraîchissement périodique. */
class EventReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val token = intent.getStringExtra(EventReminderScheduler.EXTRA_TOKEN)
                when (intent.action) {
                    EventReminderScheduler.ACTION_FIRE -> token?.let { EventReminderNotifier.fire(context, it) }
                    EventReminderScheduler.ACTION_DIGEST -> token?.let { EventReminderNotifier.fireDigest(context, it) }
                    EventReminderScheduler.ACTION_DONE -> token?.let { EventReminderNotifier.markDone(context, it) }
                    EventReminderScheduler.ACTION_REFRESH -> EventReminderScheduler.resync(context)
                }
            } finally {
                pending.finish()
            }
        }
    }
}

/** Affiche les notifications d'événements, après avoir relu l'événement : déplacé, supprimé, masqué ou fait, il se tait. */
internal object EventReminderNotifier {
    private val timeFormat = DateTimeFormatter.ofPattern("HH:mm")
    private val dayFormat = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.FRENCH)

    suspend fun fire(context: Context, token: String) {
        val key = eventKeyOfToken(token) ?: return
        val repository = CalendarGraph.repository(context)
        if (!repository.reminderSettings.first().enabled) return
        val zone = ZoneId.systemDefault()
        val day = Instant.ofEpochMilli(key.instanceBegin).atZone(zone).toLocalDate()
        val item = repository.events(EventReminderScheduler.dayRange(day, zone).widened(), CalendarSurface.REMINDERS).first()
            .firstOrNull { it.event.key == key && !it.done && !it.event.allDay } ?: return
        val start = item.event.localStart(zone)
        val now = System.currentTimeMillis()
        // Un événement déjà commencé n'annonce plus rien d'utile.
        if (start + STARTED_GRACE_MS < now) return
        EventReminderScheduler.recordDelivered(context, token)
        show(context, token, item, start, now, repository.globalSettings.first().checkEvents)
    }

    suspend fun fireDigest(context: Context, token: String) {
        val day = runCatching { LocalDate.parse(token.removePrefix("digest:")) }.getOrNull() ?: return
        val repository = CalendarGraph.repository(context)
        val settings = repository.reminderSettings.first()
        if (!settings.enabled || !settings.allDayDigest) return
        val zone = ZoneId.systemDefault()
        val events = repository.events(EventReminderScheduler.dayRange(day, zone).widened(), CalendarSurface.REMINDERS).first()
        val titles = EventReminders.allDayTitles(events, day, zone).map { it.ifBlank { context.getString(R.string.agenda_untitled) } }
        if (titles.isEmpty()) return
        EventReminderScheduler.recordDelivered(context, token)
        if (!notificationsAllowed(context)) return
        val builder = NotificationCompat.Builder(context, EventReminderScheduler.CHANNEL_ID)
            .setSmallIcon(DesignR.drawable.ic_widget_mark)
            .setContentTitle(context.getString(R.string.event_reminders_digest_title, day.format(dayFormat)))
            .setContentText(titles.joinToString(" · "))
            .setStyle(NotificationCompat.BigTextStyle().bigText(titles.joinToString("\n")))
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setAutoCancel(true)
            .setContentIntent(openAgenda(context, token))
        NotificationManagerCompat.from(context).notify(token, EventReminderScheduler.NOTIFICATION_ID, builder.build())
    }

    /** « Fait » : comme la case de l'agenda, dans Cadence seulement. */
    suspend fun markDone(context: Context, token: String) {
        val key = eventKeyOfToken(token) ?: return
        CalendarGraph.repository(context).markDone(key)
        NotificationManagerCompat.from(context).cancel(token, EventReminderScheduler.NOTIFICATION_ID)
        EventReminderScheduler.forgetPosted(context, token)
        TodayWidget().updateAll(context)
    }

    private fun show(context: Context, token: String, item: EventWithDone, start: Long, now: Long, canCheck: Boolean) {
        if (!notificationsAllowed(context)) return
        val zone = ZoneId.systemDefault()
        val time = Instant.ofEpochMilli(start).atZone(zone).format(timeFormat)
        val minutes = ((start - now + MINUTE_MS / 2) / MINUTE_MS).toInt()
        val base = if (minutes >= 1) context.getString(R.string.event_reminders_in_minutes, minutes, time) else context.getString(R.string.event_reminders_now, time)
        val builder = NotificationCompat.Builder(context, EventReminderScheduler.CHANNEL_ID)
            .setSmallIcon(DesignR.drawable.ic_widget_mark)
            .setContentTitle(item.event.title.ifBlank { context.getString(R.string.agenda_untitled) })
            .setContentText(listOfNotNull(base, item.event.location).joinToString(" · "))
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setAutoCancel(true)
            .setContentIntent(openAgenda(context, token))
            .addAction(0, context.getString(R.string.event_reminders_open_agenda), openAgenda(context, token))
        if (canCheck) {
            builder.addAction(0, context.getString(R.string.event_reminders_done), EventReminderScheduler.pending(context, EventReminderScheduler.ACTION_DONE, token, PendingIntent.FLAG_UPDATE_CURRENT))
        }
        NotificationManagerCompat.from(context).notify(token, EventReminderScheduler.NOTIFICATION_ID, builder.build())
        EventReminderScheduler.recordPosted(context, token)
    }

    private fun openAgenda(context: Context, token: String): PendingIntent {
        val intent = (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent(context, MainActivity::class.java))
            .putExtra(MainActivity.EXTRA_OPEN_AGENDA, true)
            .setData(Uri.parse("cadence-event://open/$token"))
        return PendingIntent.getActivity(
            context,
            "open:$token".hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun notificationsAllowed(context: Context): Boolean =
        (android.os.Build.VERSION.SDK_INT < 33 ||
            androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED) &&
            NotificationManagerCompat.from(context).areNotificationsEnabled()

    /** Marge d'un jour de chaque côté : un événement d'un fuseau voisin ou une journée entière ancrée en UTC reste trouvé. */
    private fun TimeRange.widened() = TimeRange(startMillis - DAY_MS, endMillis + DAY_MS)

    private const val MINUTE_MS = 60_000L
    private const val DAY_MS = 86_400_000L

    /** Une alarme à fenêtre peut partir une minute après l'heure : l'événement qui commence à peine ne se tait pas. */
    private const val STARTED_GRACE_MS = 2 * MINUTE_MS
}
