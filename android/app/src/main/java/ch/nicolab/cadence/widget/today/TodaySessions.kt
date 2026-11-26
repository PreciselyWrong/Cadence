package ch.nicolab.cadence.widget.today

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidgetManager

/**
 * Widgets « Aujourd'hui » dont la session Glance tourne. Glance 1.1 renvoie la vue au lanceur à
 * chaque `update()` d'une session ouverte, même sans changement (son état est en
 * `neverEqualPolicy`), et Smart Launcher fait sauter le widget d'une image à chaque envoi. Une
 * session ouverte relit déjà la base ([TodayWidget.provideGlance]) : seul un widget sans session
 * est réveillé. Compté par widget, car une nouvelle session peut s'ouvrir avant la fin de l'ancienne.
 */
internal class TodaySessions {
    private val open = HashMap<Int, Int>()

    @Synchronized
    fun opened(appWidgetId: Int) {
        open[appWidgetId] = (open[appWidgetId] ?: 0) + 1
    }

    @Synchronized
    fun closed(appWidgetId: Int) {
        val left = (open[appWidgetId] ?: 0) - 1
        if (left > 0) open[appWidgetId] = left else open.remove(appWidgetId)
    }

    @Synchronized
    fun needingUpdate(appWidgetIds: List<Int>): List<Int> = appWidgetIds.filter { it !in open }

    companion object {
        val process = TodaySessions()

        /** Le widget touché : démarre sa session si elle dort, sinon rien (la session redessine seule). */
        suspend fun wake(context: Context, glanceId: GlanceId) {
            val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(glanceId)
            if (process.needingUpdate(listOf(appWidgetId)).isNotEmpty()) TodayWidget().update(context, glanceId)
        }

        /**
         * Remplace `TodayWidget().updateAll` après un changement de données : démarre la session des
         * widgets qui n'en ont pas, sans renvoyer d'image aux autres.
         */
        suspend fun wakeSleeping(context: Context) {
            val manager = GlanceAppWidgetManager(context)
            val ids = manager.getGlanceIds(TodayWidget::class.java).associateBy { manager.getAppWidgetId(it) }
            process.needingUpdate(ids.keys.toList()).forEach { id -> ids[id]?.let { TodayWidget().update(context, it) } }
        }
    }
}
