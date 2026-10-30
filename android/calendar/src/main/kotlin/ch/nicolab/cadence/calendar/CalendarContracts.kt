package ch.nicolab.cadence.calendar

import kotlinx.coroutines.flow.Flow

/** Lecture seule des agendas de l'appareil. Aucune implémentation n'écrit dans le fournisseur. */
interface CalendarSource {
    /** Vrai si `READ_CALENDAR` est accordée. Sans elle, les lectures renvoient des listes vides. */
    fun hasPermission(): Boolean

    suspend fun calendars(): List<DeviceCalendar>

    /**
     * Occurrences touchant [range], récurrences dépliées. Peut en renvoyer davantage (marge d'un jour
     * pour les journées entières ancrées en UTC) : l'appelant filtre avec [overlaps].
     */
    suspend fun instances(range: TimeRange): List<CalendarEvent>

    /** Émet à chaque changement du fournisseur d'agendas ; n'émet rien sans permission. */
    fun changes(): Flow<Unit>
}

/** Réglages d'affichage persistés. Un agenda absent de [displays] suit [CalendarDisplay] par défaut. */
interface CalendarSettingsStore {
    val displays: Flow<Map<Long, CalendarDisplay>>
    val global: Flow<CalendarGlobalSettings>

    suspend fun setDisplay(calendarId: Long, display: CalendarDisplay)
    suspend fun setCheckEvents(enabled: Boolean)
    suspend fun setHideDone(enabled: Boolean)
}

/** Occurrences marquées faites dans Cadence seulement. */
interface EventDoneStore {
    val done: Flow<Set<EventInstanceKey>>

    suspend fun setDone(key: EventInstanceKey, done: Boolean)
}

/** Contrat du module pour l'interface : agendas, occurrences filtrées par surface, réglages. */
interface CalendarRepository {
    /** Vrai tant que `READ_CALENDAR` manque ; les flux renvoient alors des listes vides. */
    val permissionMissing: Flow<Boolean>
    val globalSettings: Flow<CalendarGlobalSettings>

    /** Agendas de l'appareil avec leurs réglages, triés par compte puis par nom. */
    fun calendars(): Flow<List<CalendarWithDisplay>>

    /**
     * Occurrences qui chevauchent [range] dans le fuseau de l'appareil, des agendas affichés sur
     * [surface] ; journées entières d'abord, puis par début et titre. Les faites disparaissent si
     * [CalendarGlobalSettings.hideDone].
     */
    fun events(range: TimeRange, surface: CalendarSurface): Flow<List<EventWithDone>>

    suspend fun setDisplay(calendarId: Long, display: CalendarDisplay)
    suspend fun setCheckEvents(enabled: Boolean)
    suspend fun setHideDone(enabled: Boolean)

    /** Inverse l'état fait de l'occurrence ; sans effet si « Cocher un événement » est désactivé. */
    suspend fun toggleDone(key: EventInstanceKey)

    /** Relit le fournisseur, par exemple après l'octroi de la permission. */
    fun refresh()
}
