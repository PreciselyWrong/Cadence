package ch.nicolab.cadence.tasks.planning

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeParseException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Réglages de planification et état du jour (carte du matin écartée, journée terminée), locaux à
 * l'appareil. Un seul exemplaire : l'écran Tâches et la page de réglages lisent les mêmes flux.
 */
class PlanningStore private constructor(private val prefs: SharedPreferences) {
    private val _settings = MutableStateFlow(readSettings())
    val settings: StateFlow<PlanningSettings> = _settings.asStateFlow()

    private val _dismissedDay = MutableStateFlow(readDay(KEY_DISMISSED))
    val dismissedDay: StateFlow<LocalDate?> = _dismissedDay.asStateFlow()

    private val _closedDay = MutableStateFlow(readDay(KEY_CLOSED))
    val closedDay: StateFlow<LocalDate?> = _closedDay.asStateFlow()

    fun update(transform: (PlanningSettings) -> PlanningSettings) {
        val next = transform(_settings.value)
        prefs.edit {
            putString(KEY_WORK_START, PlanningSettingsCodec.encodeTime(next.hours.start))
            putString(KEY_WORK_END, PlanningSettingsCodec.encodeTime(next.hours.end))
            putString(KEY_WORK_DAYS, PlanningSettingsCodec.encodeDays(next.hours.days))
            putString(KEY_SHUTDOWN, PlanningSettingsCodec.encodeTime(next.shutdown))
            putString(KEY_FOCUS, PlanningSettingsCodec.encodeFocus(next.focusBlocks))
        }
        _settings.value = next
    }

    fun dismissMorning(day: LocalDate) {
        prefs.edit { putString(KEY_DISMISSED, day.toString()) }
        _dismissedDay.value = day
    }

    fun closeDay(day: LocalDate) {
        prefs.edit { putString(KEY_CLOSED, day.toString()) }
        _closedDay.value = day
    }

    /** Annule « Terminer la journée » (bouton Annuler du bandeau). */
    fun reopenDay() {
        prefs.edit { remove(KEY_CLOSED) }
        _closedDay.value = null
    }

    private fun readSettings(): PlanningSettings {
        val defaults = PlanningSettings()
        return PlanningSettings(
            hours = WorkingHours(
                start = PlanningSettingsCodec.decodeTime(prefs.getString(KEY_WORK_START, null), defaults.hours.start),
                end = PlanningSettingsCodec.decodeTime(prefs.getString(KEY_WORK_END, null), defaults.hours.end),
                days = PlanningSettingsCodec.decodeDays(prefs.getString(KEY_WORK_DAYS, null), defaults.hours.days),
            ),
            shutdown = PlanningSettingsCodec.decodeTime(prefs.getString(KEY_SHUTDOWN, null), defaults.shutdown),
            focusBlocks = PlanningSettingsCodec.decodeFocus(prefs.getString(KEY_FOCUS, null)),
        )
    }

    private fun readDay(key: String): LocalDate? =
        try {
            prefs.getString(key, null)?.let(LocalDate::parse)
        } catch (_: DateTimeParseException) {
            null
        }

    companion object {
        private const val PREFS = "cadence_planning"
        private const val KEY_WORK_START = "work_start"
        private const val KEY_WORK_END = "work_end"
        private const val KEY_WORK_DAYS = "work_days"
        private const val KEY_SHUTDOWN = "shutdown"
        private const val KEY_FOCUS = "focus_blocks"
        private const val KEY_DISMISSED = "morning_dismissed_day"
        private const val KEY_CLOSED = "closed_day"

        @Volatile private var instance: PlanningStore? = null

        fun of(context: Context): PlanningStore =
            instance ?: synchronized(this) {
                instance ?: PlanningStore(
                    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE),
                ).also { instance = it }
            }
    }
}

/** Jours de la semaine dans l'ordre d'affichage français, lundi en premier. */
internal val WEEK_ORDER: List<DayOfWeek> = DayOfWeek.entries
