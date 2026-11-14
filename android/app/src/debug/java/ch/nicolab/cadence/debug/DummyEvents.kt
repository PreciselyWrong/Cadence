package ch.nicolab.cadence.debug

import android.content.ContentValues
import android.content.Context
import android.provider.CalendarContract
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/**
 * Agenda local de démonstration (debug seulement, permission WRITE_CALENDAR accordée par adb) : quelques événements
 * du jour pour juger la ligne du temps d'Aujourd'hui sur l'émulateur. Recréé à chaque envoi.
 */
internal object DummyEvents {
    private const val ACCOUNT = "cadence-demo"

    private data class Demo(val title: String, val from: LocalTime, val to: LocalTime, val color: Int)

    private val calendars = listOf("Famille" to 0xFF2BB5A3.toInt(), "Perso" to 0xFFE8803A.toInt(), "Cuisine" to 0xFF3B82F6.toInt())

    fun seed(context: Context, today: LocalDate, zone: ZoneId) {
        val resolver = context.contentResolver
        val asSync = CalendarContract.Calendars.CONTENT_URI.buildUpon()
            .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
            .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_NAME, ACCOUNT)
            .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
            .build()
        resolver.delete(asSync, "${CalendarContract.Calendars.ACCOUNT_NAME} = ?", arrayOf(ACCOUNT))
        val ids = calendars.associate { (name, color) ->
            val values = ContentValues().apply {
                put(CalendarContract.Calendars.ACCOUNT_NAME, ACCOUNT)
                put(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
                put(CalendarContract.Calendars.NAME, name)
                put(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, name)
                put(CalendarContract.Calendars.CALENDAR_COLOR, color)
                put(CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL, CalendarContract.Calendars.CAL_ACCESS_OWNER)
                put(CalendarContract.Calendars.OWNER_ACCOUNT, ACCOUNT)
                put(CalendarContract.Calendars.VISIBLE, 1)
                put(CalendarContract.Calendars.SYNC_EVENTS, 1)
            }
            name to resolver.insert(asSync, values)!!.lastPathSegment!!.toLong()
        }
        listOf(
            Triple("Perso", "Foire aux livres", LocalTime.of(13, 30) to LocalTime.of(15, 0)),
            Triple("Famille", "Anniversaire Jeanne 8 ans", LocalTime.of(15, 0) to LocalTime.of(17, 30)),
            Triple("Cuisine", "Batch : courses au marché", LocalTime.of(11, 0) to LocalTime.of(11, 45)),
            Triple("Famille", "Apéro chez les voisins", LocalTime.of(17, 45) to LocalTime.of(18, 30)),
        ).forEach { (calendar, title, span) ->
            val values = ContentValues().apply {
                put(CalendarContract.Events.CALENDAR_ID, ids.getValue(calendar))
                put(CalendarContract.Events.TITLE, title)
                put(CalendarContract.Events.DTSTART, today.atTime(span.first).atZone(zone).toInstant().toEpochMilli())
                put(CalendarContract.Events.DTEND, today.atTime(span.second).atZone(zone).toInstant().toEpochMilli())
                put(CalendarContract.Events.EVENT_TIMEZONE, zone.id)
            }
            resolver.insert(CalendarContract.Events.CONTENT_URI, values)
        }
    }
}
