package ch.nicolab.cadence.calendar

/** Agendas d'un même compte, utilisés d'abord, puis ceux que Cadence ignore. */
data class CalendarAccountSection(
    val accountName: String,
    val accountType: String,
    val used: List<CalendarWithDisplay>,
    val unused: List<CalendarWithDisplay>,
)

/**
 * Liste des agendas telle que Réglages › Agendas et la feuille de l'Agenda la montrent : un bloc par
 * compte dans l'ordre de l'appareil, chaque bloc séparant les agendas utilisés des autres.
 */
fun calendarAccountSections(calendars: List<CalendarWithDisplay>): List<CalendarAccountSection> =
    calendars.groupBy { it.calendar.accountName to it.calendar.accountType }.map { (account, items) ->
        val (used, unused) = items.partition { it.display.isUsed(it.calendar) }
        CalendarAccountSection(account.first, account.second, used, unused)
    }
