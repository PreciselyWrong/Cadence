package ch.nicolab.cadence.reminder

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import androidx.core.app.NotificationManagerCompat
import ch.nicolab.cadence.R
import ch.nicolab.cadence.calendar.CalendarGraph
import ch.nicolab.cadence.calendar.CalendarSurface
import ch.nicolab.cadence.calendar.EventReminderSettings
import ch.nicolab.cadence.calendar.EventReminders
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.calendar.TimeRange
import ch.nicolab.cadence.calendar.token
import ch.nicolab.cadence.domain.QuietPolicy
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.reminder.ReminderAlarms
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Pose une alarme par événement d'agenda notifiable (agenda dont « Notifications » est actif, ni masqué partout,
 * ni fait, doublons entre agendas fusionnés) dans l'horizon de 14 jours, et un résumé par jour de journées
 * entières si le réglage est actif. Les décisions sont dans [EventReminders] ; ici, seulement Android.
 *
 * Le fournisseur d'agendas est observé tant que l'app vit (`CalendarRepository.events` suit un `ContentObserver`
 * sur `CalendarContract`). Une alarme de rafraîchissement toutes les 6 h relance le processus et rattrape ce
 * qui a changé pendant qu'il dormait. À l'heure dite, l'événement est relu : déplacé, supprimé, masqué ou fait,
 * il ne sonne pas.
 */
object EventReminderScheduler {
    const val CHANNEL_ID = "calendar_events"
    internal const val ACTION_FIRE = "ch.nicolab.cadence.reminder.EVENT_FIRE"
    internal const val ACTION_DIGEST = "ch.nicolab.cadence.reminder.EVENT_DIGEST"
    internal const val ACTION_DONE = "ch.nicolab.cadence.reminder.EVENT_DONE"
    internal const val ACTION_REFRESH = "ch.nicolab.cadence.reminder.EVENT_REFRESH"
    internal const val EXTRA_TOKEN = "event_token"
    internal const val NOTIFICATION_ID = 7

    private const val PREFS = "cadence_event_reminders"
    private const val KEY_SCHEDULED = "scheduled"
    private const val KEY_DELIVERED = "delivered"
    private const val KEY_POSTED = "posted"
    private val REFRESH_EVERY: Duration = Duration.ofHours(6)
    private val lock = Any()

    fun createChannel(context: Context) {
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL_ID, context.getString(R.string.event_reminders_channel), NotificationManager.IMPORTANCE_DEFAULT),
        )
    }

    /** Suit agendas, réglages, plage silencieuse et horloge : tout changement repose les alarmes. */
    @OptIn(ExperimentalCoroutinesApi::class)
    fun start(context: Context, scope: CoroutineScope) {
        val app = context.applicationContext
        val repository = CalendarGraph.repository(app)
        scope.launch {
            val events = periodicTicks().flatMapLatest { repository.events(horizonRange(), CalendarSurface.REMINDERS) }
            combine(events, repository.reminderSettings, quietPolicies(app)) { list, settings, quiet -> Triple(list, settings, quiet) }
                // Le fournisseur émet en rafale lors d'une synchronisation d'agenda.
                .debounce(DEBOUNCE_MS)
                .collect { (list, settings, quiet) -> reschedule(app, list, settings, quiet, Instant.now()) }
        }
        armRefresh(app)
    }

    /** Aligne les alarmes sur l'état courant : redémarrage, mise à jour de l'app, changement d'heure ou de fuseau. */
    suspend fun resync(context: Context) {
        val app = context.applicationContext
        val repository = CalendarGraph.repository(app)
        reschedule(
            app,
            repository.events(horizonRange(), CalendarSurface.REMINDERS).first(),
            repository.reminderSettings.first(),
            currentQuiet(app),
            Instant.now(),
        )
        armRefresh(app)
    }

    internal suspend fun currentQuiet(context: Context): QuietPolicy =
        TasksGraph.connection(context).observe().first()?.quiet ?: QuietPolicy.NONE

    private fun quietPolicies(context: Context): Flow<QuietPolicy> =
        TasksGraph.connection(context).observe().map { it?.quiet ?: QuietPolicy.NONE }.distinctUntilChanged()

    private fun periodicTicks(): Flow<Unit> = flow {
        while (true) {
            emit(Unit)
            delay(REFRESH_EVERY.toMillis())
        }
    }

    /** Du début d'aujourd'hui à l'horizon (+ 1 jour pour les débuts et les résumés en bordure). */
    internal fun horizonRange(now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): TimeRange {
        val start = now.atZone(zone).toLocalDate().atStartOfDay(zone).toInstant()
        return TimeRange(start.toEpochMilli(), now.plus(EventReminders.HORIZON).plus(Duration.ofDays(1)).toEpochMilli())
    }

    internal fun dayRange(day: LocalDate, zone: ZoneId = ZoneId.systemDefault()): TimeRange =
        TimeRange(day.atStartOfDay(zone).toInstant().toEpochMilli(), day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli())

    internal fun reschedule(
        context: Context,
        events: List<EventWithDone>,
        settings: EventReminderSettings,
        quiet: QuietPolicy,
        now: Instant,
    ) {
        val zone = ZoneId.systemDefault()
        synchronized(lock) {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val delivered = EventReminders.pruneDelivered(prefs.stringSet(KEY_DELIVERED), now, zone)
            val plan = EventReminders.plan(events, settings, delivered, now, zone, quiet::shift)
            val wanted = plan.events.associateBy { it.key.token() } + plan.digests.associateBy { it.token }
            (prefs.stringSet(KEY_SCHEDULED) - wanted.keys).forEach { cancel(context, it) }
            plan.events.forEach { ReminderAlarms.arm(context, it.triggerAt.toEpochMilli(), pending(context, ACTION_FIRE, it.key.token(), PendingIntent.FLAG_UPDATE_CURRENT)!!) }
            plan.digests.forEach { ReminderAlarms.arm(context, it.triggerAt.toEpochMilli(), pending(context, ACTION_DIGEST, it.token, PendingIntent.FLAG_UPDATE_CURRENT)!!) }

            // Une notification affichée dont l'événement n'est plus notifiable (fait, supprimé, agenda coupé) s'efface.
            val alive = events.filter { !it.done }.mapTo(HashSet()) { it.event.key.token() }
            val posted = prefs.stringSet(KEY_POSTED)
            val gone = posted.filterNot { it in alive }
            val notifications = NotificationManagerCompat.from(context)
            gone.forEach { notifications.cancel(it, NOTIFICATION_ID) }
            prefs.edit()
                .putStringSet(KEY_SCHEDULED, wanted.keys)
                .putStringSet(KEY_DELIVERED, delivered)
                .putStringSet(KEY_POSTED, posted - gone.toSet())
                .apply()
        }
    }

    internal fun recordDelivered(context: Context, token: String) = update(context, KEY_DELIVERED) { it + token }

    internal fun recordPosted(context: Context, token: String) = update(context, KEY_POSTED) { it + token }

    internal fun forgetPosted(context: Context, token: String) = update(context, KEY_POSTED) { it - token }

    internal fun isDelivered(context: Context, token: String): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).stringSet(KEY_DELIVERED).contains(token)

    /** Intent explicite d'une alarme ; [flag] `FLAG_NO_CREATE` sert à retrouver une alarme posée pour l'annuler. */
    internal fun pending(context: Context, action: String, token: String, flag: Int): PendingIntent? =
        PendingIntent.getBroadcast(
            context,
            "$action:$token".hashCode(),
            Intent(context, EventReminderReceiver::class.java)
                .setAction(action)
                .setData(Uri.parse("cadence-event://alarm/$action/$token"))
                .putExtra(EXTRA_TOKEN, token),
            flag or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun cancel(context: Context, token: String) {
        val action = if (token.startsWith("digest:")) ACTION_DIGEST else ACTION_FIRE
        val pending = pending(context, action, token, PendingIntent.FLAG_NO_CREATE) ?: return
        context.getSystemService(AlarmManager::class.java).cancel(pending)
        pending.cancel()
    }

    private fun armRefresh(context: Context) {
        val pending = PendingIntent.getBroadcast(
            context,
            ACTION_REFRESH.hashCode(),
            Intent(context, EventReminderReceiver::class.java).setAction(ACTION_REFRESH),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val at = Instant.now().plus(REFRESH_EVERY).toEpochMilli()
        context.getSystemService(AlarmManager::class.java)
            .setWindow(AlarmManager.RTC, at, ReminderAlarms.WINDOW_MILLIS * 30, pending)
    }

    private fun update(context: Context, key: String, transform: (Set<String>) -> Set<String>) {
        synchronized(lock) {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            prefs.edit().putStringSet(key, transform(prefs.stringSet(key))).apply()
        }
    }

    private fun SharedPreferences.stringSet(key: String): Set<String> = getStringSet(key, emptySet()).orEmpty().toSet()

    private const val DEBOUNCE_MS = 500L
}
