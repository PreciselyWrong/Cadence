package ch.nicolab.cadence.designsystem.components

/** Icône d'agenda d'un événement : non faite (agenda) ou faite (agenda coché). */
enum class EventGlyph { CALENDAR, CALENDAR_CHECKED }

fun eventGlyphOf(done: Boolean): EventGlyph = if (done) EventGlyph.CALENDAR_CHECKED else EventGlyph.CALENDAR
