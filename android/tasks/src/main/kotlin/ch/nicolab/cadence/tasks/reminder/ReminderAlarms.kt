package ch.nicolab.cadence.tasks.reminder

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build

/**
 * Pose des alarmes de rappel : exactes si Android l'autorise (permission « Alarmes et rappels » accordée, ou
 * version qui n'en demande pas), sinon inexactes à partir d'une minute avant l'heure. Les deux sonnent en
 * veille profonde : une alarme `setWindow` attendrait la fin de Doze, souvent après le début de l'événement,
 * qui ne sonnerait alors plus. Partagé par les rappels de tâches et d'événements.
 */
object ReminderAlarms {
    /** Largeur de la fenêtre : ±1 minute autour de l'heure voulue. */
    const val WINDOW_MILLIS = 120_000L
    private const val HALF_WINDOW_MILLIS = WINDOW_MILLIS / 2

    enum class Mode { EXACT, WINDOW }

    internal fun mode(sdk: Int, canScheduleExact: Boolean): Mode =
        if (sdk < Build.VERSION_CODES.S || canScheduleExact) Mode.EXACT else Mode.WINDOW

    /** Début de la fenêtre pour une alarme voulue à [triggerAtMillis]. */
    internal fun windowStart(triggerAtMillis: Long): Long = triggerAtMillis - HALF_WINDOW_MILLIS

    /** Vrai si les alarmes exactes sont utilisables (rien à accorder avant Android 12). */
    fun canScheduleExact(context: Context): Boolean =
        mode(Build.VERSION.SDK_INT, canScheduleExactNow(context)) == Mode.EXACT

    fun arm(context: Context, triggerAtMillis: Long, pending: PendingIntent) {
        val alarms = context.getSystemService(AlarmManager::class.java)
        if (canScheduleExact(context)) {
            try {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pending)
                return
            } catch (_: SecurityException) {
                // Permission retirée entre la vérification et la pose : la fenêtre ci-dessous suffit.
            }
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, windowStart(triggerAtMillis), pending)
    }

    private fun canScheduleExactNow(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S || context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
}
