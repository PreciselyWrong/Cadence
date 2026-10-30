package ch.nicolab.cadence.widget.today

import android.content.Context

/** Réglages par instance du widget, rangés dans `cadence_today_widget` sous le préfixe de l'identifiant. */
class TodayWidgetConfigStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun load(appWidgetId: Int): TodayWidgetConfig =
        TodayWidgetConfigCodec.decode { field -> prefs.getString(key(appWidgetId, field), null) }

    fun save(appWidgetId: Int, config: TodayWidgetConfig) {
        val editor = prefs.edit()
        TodayWidgetConfigCodec.encode(config).forEach { (field, value) ->
            editor.putString(key(appWidgetId, field), value)
        }
        editor.apply()
    }

    fun remove(appWidgetIds: IntArray) {
        val editor = prefs.edit()
        appWidgetIds.forEach { appWidgetId ->
            TodayWidgetConfigCodec.encode(TodayWidgetConfig()).keys.forEach { field ->
                editor.remove(key(appWidgetId, field))
            }
        }
        editor.apply()
    }

    private fun key(appWidgetId: Int, field: String) = "$appWidgetId.$field"

    private companion object {
        const val PREFS_NAME = "cadence_today_widget"
    }
}
