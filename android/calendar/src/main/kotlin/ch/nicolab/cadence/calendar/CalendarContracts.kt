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

/** Occurrences masquées dans Cadence seulement ; l'agenda de l'appareil n'est jamais touché. */
interface EventHiddenStore {
    val hidden: Flow<Set<HiddenEvent>>

    /** Ajoute ou retire [event] (identifié par sa clé ; un titre plus récent remplace l'ancien). */
    suspend fun setHidden(event: HiddenEvent, hidden: Boolean)
}

/** Contrat du module pour l'interface : agendas, occurrences filtrées par surface, masquées, réglages. */
interface CalendarRepository {
    /** Vrai tant que `READ_CALENDAR` manque ; les flux renvoient alors des listes vides. */
    val permissionMissing: Flow<Boolean>
    val globalSettings: Flow<CalendarGlobalSettings>

    /** Agendas de l'appareil avec leurs réglages, triés par compte puis par nom. */
    fun calendars(): Flow<List<CalendarWithDisplay>>

    /**
     * Occurrences qui chevauchent [range] dans le fuseau de l'appareil, des agendas affichés sur
     * [surface] ; journées entières d'abord, puis par début et titre. Les faites disparaissent si
     * [CalendarGlobalSettings.hideDone]. Les occurrences masquées (voir [hideEvent]) n'y figurent jamais.
     */
    fun events(range: TimeRange, surface: CalendarSurface): Flow<List<EventWithDone>>

    suspend fun setDisplay(calendarId: Long, display: CalendarDisplay)
    suspend fun setCheckEvents(enabled: Boolean)
    suspend fun setHideDone(enabled: Boolean)

    /** Masque l'occurrence sur toutes les surfaces, dans Cadence seulement (aucune écriture dans le fournisseur). */
    suspend fun hideEvent(event: HiddenEvent)

    /** Rend une occurrence masquée ; sans effet si elle ne l'était pas. */
    suspend fun restoreEvent(key: EventInstanceKey)

    /** Occurrences masquées, les plus récentes d'abord, pour les réglages. */
    fun hiddenEvents(): Flow<List<HiddenEvent>>

    /** Inverse l'état fait de l'occurrence ; sans effet si « Cocher un événement » est désactivé. */
    suspend fun toggleDone(key: EventInstanceKey)

    /** Relit le fournisseur, par exemple après l'octroi de la permission. */
    fun refresh()
}
