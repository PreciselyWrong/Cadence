package ch.nicolab.cadence.calendar.data

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.database.Cursor
import android.os.Handler
import android.os.Looper
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
import ch.nicolab.cadence.calendar.CalendarEvent
import ch.nicolab.cadence.calendar.CalendarSource
import ch.nicolab.cadence.calendar.DeviceCalendar
import ch.nicolab.cadence.calendar.TimeRange
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.conflate
import kotlinx.coroutines.withContext

/**
 * Lecture seule de `CalendarContract` : seuls `query` et `registerContentObserver` sont appelés.
 * Une permission révoquée en cours de lecture donne une liste vide plutôt qu'une erreur.
 */
internal class AndroidCalendarSource(
    context: Context,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) : CalendarSource {
    private val appContext = context.applicationContext
    private val resolver = appContext.contentResolver

    override fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(appContext, Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED

    override suspend fun calendars(): List<DeviceCalendar> = withContext(io) {
        if (!hasPermission()) return@withContext emptyList()
        try {
            resolver.query(CalendarContract.Calendars.CONTENT_URI, CALENDAR_PROJECTION, null, null, null)?.use { cursor ->
                buildList {
                    while (cursor.moveToNext()) add(cursor.toDeviceCalendar())
                }
            }.orEmpty()
        } catch (e: SecurityException) {
            emptyList()
        }
    }

    override suspend fun instances(range: TimeRange): List<CalendarEvent> = withContext(io) {
        if (!hasPermission()) return@withContext emptyList()
        val builder = CalendarContract.Instances.CONTENT_URI.buildUpon()
        ContentUris.appendId(builder, range.startMillis - DAY_MS)
        ContentUris.appendId(builder, range.endMillis + DAY_MS)
        try {
            resolver.query(builder.build(), INSTANCE_PROJECTION, NOT_CANCELED_SELECTION, NOT_CANCELED_ARGS, null)?.use { cursor ->
                buildList {
                    while (cursor.moveToNext()) add(cursor.toCalendarEvent())
                }
            }.orEmpty()
        } catch (e: SecurityException) {
            emptyList()
        }
    }

    override fun changes(): Flow<Unit> = callbackFlow {
        if (!hasPermission()) {
            close()
            return@callbackFlow
        }
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) {
                trySend(Unit)
            }
        }
        try {
            resolver.registerContentObserver(CalendarContract.CONTENT_URI, true, observer)
        } catch (e: SecurityException) {
            close()
            return@callbackFlow
        }
        awaitClose { resolver.unregisterContentObserver(observer) }
    }.conflate()

    private fun Cursor.toDeviceCalendar() = DeviceCalendar(
        id = getLong(getColumnIndexOrThrow(CalendarContract.Calendars._ID)),
        accountName = getStringOrEmpty(CalendarContract.Calendars.ACCOUNT_NAME),
        accountType = getStringOrEmpty(CalendarContract.Calendars.ACCOUNT_TYPE),
        displayName = getStringOrEmpty(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME),
        colorArgb = getIntOrZero(CalendarContract.Calendars.CALENDAR_COLOR),
        visibleOnDevice = getIntOrZero(CalendarContract.Calendars.VISIBLE) == 1,
        syncEvents = getIntOrZero(CalendarContract.Calendars.SYNC_EVENTS) == 1,
    )

    private fun Cursor.toCalendarEvent() = CalendarEvent(
        calendarId = getLong(getColumnIndexOrThrow(CalendarContract.Instances.CALENDAR_ID)),
        eventId = getLong(getColumnIndexOrThrow(CalendarContract.Instances.EVENT_ID)),
        instanceBegin = getLong(getColumnIndexOrThrow(CalendarContract.Instances.BEGIN)),
        instanceEnd = getLong(getColumnIndexOrThrow(CalendarContract.Instances.END)),
        allDay = getIntOrZero(CalendarContract.Instances.ALL_DAY) == 1,
        title = getStringOrEmpty(CalendarContract.Instances.TITLE),
        location = getStringOrEmpty(CalendarContract.Instances.EVENT_LOCATION).takeIf { it.isNotBlank() },
        colorArgb = getIntOrZero(CalendarContract.Instances.DISPLAY_COLOR),
        description = getStringOrEmpty(CalendarContract.Instances.DESCRIPTION).take(DESCRIPTION_MAX).takeIf { it.isNotBlank() },
    )

    private fun Cursor.getStringOrEmpty(column: String): String =
        getString(getColumnIndexOrThrow(column)).orEmpty()

    private fun Cursor.getIntOrZero(column: String): Int {
        val index = getColumnIndexOrThrow(column)
        return if (isNull(index)) 0 else getInt(index)
    }

    private companion object {
        /** Les journées entières sont ancrées à minuit UTC : on élargit d'un jour de chaque côté. */
        const val DAY_MS = 86_400_000L

        /** Une description démesurée n'a pas sa place dans une fiche d'événement. */
        const val DESCRIPTION_MAX = 8_000

        val CALENDAR_PROJECTION = arrayOf(
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.ACCOUNT_NAME,
            CalendarContract.Calendars.ACCOUNT_TYPE,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            CalendarContract.Calendars.CALENDAR_COLOR,
            CalendarContract.Calendars.VISIBLE,
            CalendarContract.Calendars.SYNC_EVENTS,
        )

        val INSTANCE_PROJECTION = arrayOf(
            CalendarContract.Instances.CALENDAR_ID,
            CalendarContract.Instances.EVENT_ID,
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END,
            CalendarContract.Instances.ALL_DAY,
            CalendarContract.Instances.TITLE,
            CalendarContract.Instances.EVENT_LOCATION,
            CalendarContract.Instances.DISPLAY_COLOR,
            CalendarContract.Instances.STATUS,
            CalendarContract.Instances.DESCRIPTION,
        )

        const val NOT_CANCELED_SELECTION =
            "${CalendarContract.Instances.STATUS} IS NULL OR ${CalendarContract.Instances.STATUS} != ?"
        val NOT_CANCELED_ARGS = arrayOf(CalendarContract.Events.STATUS_CANCELED.toString())
    }
}
