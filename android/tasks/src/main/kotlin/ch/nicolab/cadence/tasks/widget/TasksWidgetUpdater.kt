package ch.nicolab.cadence.tasks.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.glance.appwidget.updateAll
import ch.nicolab.cadence.tasks.TasksGraph
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

/**
 * Garde les widgets Tâches à jour : à chaque changement de données, et à minuit
 * local, par alarme, car l'app peut être fermée à ce moment-là.
 */
object TasksWidgetUpdater {
    private const val ACTION_MIDNIGHT = "ch.nicolab.cadence.tasks.widget.ACTION_MIDNIGHT"
    private const val DEBOUNCE_MILLIS = 100L

    fun start(context: Context, scope: CoroutineScope) {
        val app = context.applicationContext
        scheduleMidnight(app)
        scope.launch {
            TasksGraph.repository(app).observeTasks()
                .distinctUntilChanged()
                .debounce(DEBOUNCE_MILLIS)
                .collect {
                    TasksWidget().updateAll(app)
                    TasksSquareWidget().updateAll(app)
                }
        }
    }

    /** Une alarme approchée suffit : le widget n'a pas besoin d'être exact à la seconde. */
    fun scheduleMidnight(context: Context) {
        val zone = ZoneId.systemDefault()
        val nextMidnight = LocalDate.now(zone).plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
        val intent = Intent(context, TasksDayChangeReceiver::class.java).setAction(ACTION_MIDNIGHT)
        val pending = PendingIntent.getBroadcast(
            context,
            ACTION_MIDNIGHT.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        context.getSystemService(AlarmManager::class.java).set(AlarmManager.RTC_WAKEUP, nextMidnight, pending)
    }
}

/** Date, heure ou fuseau changés, ou minuit atteint : le contenu du jour change. */
class TasksDayChangeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        runAsync {
            TasksWidget().updateAll(context)
            TasksSquareWidget().updateAll(context)
            TasksWidgetUpdater.scheduleMidnight(context)
        }
    }
}
