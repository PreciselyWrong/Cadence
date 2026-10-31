package ch.nicolab.cadence.calendar

/**
 * Agenda de l'appareil tel que le fournit `CalendarContract.Calendars`.
 *
 * @property accountType type de compte Android (`com.google` pour Google), pour libeller la source.
 * @property visibleOnDevice choix « visible » de l'application d'agenda du système, indicatif seulement.
 * @property syncEvents l'agenda est synchronisé sur l'appareil ; sinon ses occurrences sont absentes.
 */
data class DeviceCalendar(
    val id: Long,
    val accountName: String,
    val accountType: String,
    val displayName: String,
    val colorArgb: Int,
    val visibleOnDevice: Boolean,
    val syncEvents: Boolean = true,
)

/** Identité stable d'une occurrence : un événement récurrent a une clé par occurrence. */
data class EventInstanceKey(
    val calendarId: Long,
    val eventId: Long,
    val instanceBegin: Long,
)

/**
 * Occurrence d'événement lue dans `CalendarContract.Instances`.
 *
 * Bornes en millisecondes epoch, fin exclusive, telles que le fournisseur les donne : une occurrence
 * « journée entière » est ancrée à minuit UTC. Utiliser [localStart] et [localEnd] pour la placer
 * dans le fuseau de l'appareil.
 */
data class CalendarEvent(
    val calendarId: Long,
    val eventId: Long,
    val instanceBegin: Long,
    val instanceEnd: Long,
    val allDay: Boolean,
    val title: String,
    val location: String?,
    val colorArgb: Int,
    val description: String? = null,
) {
    val key: EventInstanceKey get() = EventInstanceKey(calendarId, eventId, instanceBegin)
}

/**
 * Occurrence masquée dans Cadence seulement. Le titre et le jour d'une journée entière sont gardés
 * pour la lister dans les réglages, même quand l'occurrence sort de la plage chargée.
 */
data class HiddenEvent(
    val key: EventInstanceKey,
    val title: String,
    val allDay: Boolean,
)

fun CalendarEvent.toHidden(): HiddenEvent = HiddenEvent(key, title, allDay)

/**
 * Ce qu'une fiche d'événement montre, dans le fuseau de l'appareil. [start] et [end] sont des heures
 * locales (une journée entière va de minuit à minuit du lendemain, fin exclusive).
 */
data class EventDetail(
    val key: EventInstanceKey,
    val title: String,
    val calendarName: String,
    val colorArgb: Int,
    val allDay: Boolean,
    val start: java.time.LocalDateTime,
    val end: java.time.LocalDateTime,
    val location: String?,
    val description: String?,
    val done: Boolean,
) {
    fun toHidden(): HiddenEvent = HiddenEvent(key, title, allDay)
}

/** Surface de Cadence où un agenda peut apparaître. */
enum class CalendarSurface { AGENDA, TASKS, WIDGET }

/**
 * Où les événements d'un agenda apparaissent. Les valeurs par défaut sont celles d'un agenda neuf.
 *
 * @property used « Utiliser dans Cadence » ; null tant que l'utilisateur n'a pas choisi (voir [isUsed]).
 */
data class CalendarDisplay(
    val agenda: Boolean = true,
    val tasks: Boolean = true,
    val widget: Boolean = false,
    val used: Boolean? = null,
) {
    fun shows(surface: CalendarSurface): Boolean = when (surface) {
        CalendarSurface.AGENDA -> agenda
        CalendarSurface.TASKS -> tasks
        CalendarSurface.WIDGET -> widget
    }
}

/** Vrai si l'agenda sert dans Cadence : le choix de l'utilisateur, sinon la synchronisation de l'appareil. */
fun CalendarDisplay.isUsed(calendar: DeviceCalendar): Boolean = used ?: calendar.syncEvents

/**
 * Réglages communs à tous les agendas.
 *
 * @property checkEvents « Cocher un événement » : sans lui, aucune occurrence n'est présentée comme faite.
 * @property hideDone « Masquer les événements faits », sur toutes les surfaces.
 */
data class CalendarGlobalSettings(
    val checkEvents: Boolean = true,
    val hideDone: Boolean = false,
)

data class CalendarWithDisplay(
    val calendar: DeviceCalendar,
    val display: CalendarDisplay,
)

/** Occurrence prête à afficher, avec son agenda et son état « fait » propre à Cadence. */
data class EventWithDone(
    val event: CalendarEvent,
    val calendar: DeviceCalendar,
    val done: Boolean,
)

/** Plage `[startMillis, endMillis[` en millisecondes epoch. */
data class TimeRange(val startMillis: Long, val endMillis: Long) {
    init {
        require(endMillis >= startMillis) { "endMillis < startMillis" }
    }

    companion object
}
