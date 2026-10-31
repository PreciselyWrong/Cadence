package ch.nicolab.cadence.ui

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val SHORT_DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", Locale.FRENCH)

/** Date courte en français, « 30 oct. » : jamais l'écriture ISO à l'écran. */
internal fun LocalDate.shortFrench(): String = format(SHORT_DATE)

private val LONG_DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE d MMMM yyyy", Locale.FRENCH)

/** Date complète en français, « samedi 31 octobre 2026 ». */
internal fun LocalDate.longFrench(): String = format(LONG_DATE)

/** Lit une date ISO persistée (étiquette de période) et la rend en « 30 oct. » ; le texte reste tel quel s'il n'en est pas une. */
internal fun shortFrenchOrSame(iso: String): String = runCatching { LocalDate.parse(iso).shortFrench() }.getOrDefault(iso)
