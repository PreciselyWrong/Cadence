package ch.nicolab.cadence.calendar.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import ch.nicolab.cadence.calendar.CalendarCodecs
import ch.nicolab.cadence.calendar.CalendarDisplay
import ch.nicolab.cadence.calendar.CalendarGlobalSettings
import ch.nicolab.cadence.calendar.CalendarSettingsStore
import ch.nicolab.cadence.calendar.EventDoneStore
import ch.nicolab.cadence.calendar.EventHiddenStore
import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.calendar.HiddenEvent
import java.io.IOException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

private val Context.calendarDataStore by preferencesDataStore(name = "cadence_calendar")

internal fun Context.calendarPreferences(): DataStore<Preferences> = calendarDataStore

/** Réglages d'agenda et occurrences faites, dans un même DataStore Preferences. */
internal class PreferencesCalendarStore(
    private val dataStore: DataStore<Preferences>,
) : CalendarSettingsStore, EventDoneStore, EventHiddenStore {

    private val prefs: Flow<Preferences> = dataStore.data.catch { error ->
        if (error is IOException) emit(emptyPreferences()) else throw error
    }

    override val displays: Flow<Map<Long, CalendarDisplay>> = prefs.map { p ->
        p.asMap().mapNotNull { (key, value) ->
            val name = key.name
            if (!name.startsWith(DISPLAY_PREFIX) || value !is Int) return@mapNotNull null
            val calendarId = name.removePrefix(DISPLAY_PREFIX).toLongOrNull() ?: return@mapNotNull null
            calendarId to CalendarCodecs.decodeDisplay(value)
        }.toMap()
    }.distinctUntilChanged()

    override val global: Flow<CalendarGlobalSettings> = prefs.map { p ->
        CalendarGlobalSettings(
            checkEvents = p[CHECK_EVENTS] ?: true,
            hideDone = p[HIDE_DONE] ?: false,
        )
    }.distinctUntilChanged()

    override val done: Flow<Set<EventInstanceKey>> = prefs.map { p ->
        p[DONE_INSTANCES].orEmpty().mapNotNull(CalendarCodecs::decodeKey).toSet()
    }.distinctUntilChanged()

    override val hidden: Flow<Set<HiddenEvent>> = prefs.map { p ->
        p[HIDDEN_INSTANCES].orEmpty().mapNotNull(CalendarCodecs::decodeHidden).toSet()
    }.distinctUntilChanged()

    override suspend fun setDisplay(calendarId: Long, display: CalendarDisplay) {
        dataStore.edit { it[intPreferencesKey("$DISPLAY_PREFIX$calendarId")] = CalendarCodecs.encodeDisplay(display) }
    }

    override suspend fun setCheckEvents(enabled: Boolean) {
        dataStore.edit { it[CHECK_EVENTS] = enabled }
    }

    override suspend fun setHideDone(enabled: Boolean) {
        dataStore.edit { it[HIDE_DONE] = enabled }
    }

    override suspend fun setDone(key: EventInstanceKey, done: Boolean) {
        val encoded = CalendarCodecs.encodeKey(key)
        dataStore.edit { p ->
            val current = p[DONE_INSTANCES].orEmpty()
            p[DONE_INSTANCES] = if (done) current + encoded else current - encoded
        }
    }

    override suspend fun setHidden(event: HiddenEvent, hidden: Boolean) {
        val prefix = CalendarCodecs.encodeKey(event.key) + ":"
        dataStore.edit { p ->
            val kept = p[HIDDEN_INSTANCES].orEmpty().filterNot { it.startsWith(prefix) }.toSet()
            p[HIDDEN_INSTANCES] = if (hidden) kept + CalendarCodecs.encodeHidden(event) else kept
        }
    }

    private companion object {
        const val DISPLAY_PREFIX = "display_"
        val CHECK_EVENTS = booleanPreferencesKey("check_events")
        val HIDE_DONE = booleanPreferencesKey("hide_done")
        val DONE_INSTANCES = stringSetPreferencesKey("done_instances")
        val HIDDEN_INSTANCES = stringSetPreferencesKey("hidden_instances")
    }
}
