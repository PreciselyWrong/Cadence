package ch.nicolab.cadence.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import ch.nicolab.cadence.CadenceApp
import ch.nicolab.cadence.domain.WidgetRefreshSchedule
import kotlinx.coroutines.launch
import java.time.LocalDateTime
import java.time.ZoneId

/**
 * Réveille le widget au prochain instant où son contenu change de lui-même : minuit, ou
 * une borne de groupe horaire. Sans cela l'affichage attendrait le cycle du système, long
 * d'une demi-heure.
 */
object WidgetBoundaryAlarm {
    const val ACTION_BOUNDARY = "ch.nicolab.cadence.widget.ACTION_BOUNDARY"

    fun arm(context: Context) {
        val app = context.applicationContext as CadenceApp
        app.applicationScope.launch {
            val groups = app.repository.getGroups()
            val hasLiveCounter = app.repository.getHabitsEffectiveAt(java.time.LocalDate.now()).any {
                it.goal.isAbstinence && it.active && !it.archived
            }
            val next = WidgetRefreshSchedule.nextBoundary(
                LocalDateTime.now(),
                groups,
                refreshEveryMinutes = 60.takeIf { hasLiveCounter },
            )
            val triggerAt = next.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
            // Une alarme approchée suffit : la seconde près n'a pas de sens à l'écran, et
            // elle n'exige aucune permission d'alarme exacte.
            alarmManager(context).set(AlarmManager.RTC, triggerAt, intent(context))
        }
    }

    fun cancel(context: Context) {
        alarmManager(context).cancel(intent(context))
    }

    private fun alarmManager(context: Context) =
        context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    private fun intent(context: Context): PendingIntent = PendingIntent.getBroadcast(
        context,
        0,
        Intent(context, CadenceWidgetReceiver::class.java).setAction(ACTION_BOUNDARY),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}
