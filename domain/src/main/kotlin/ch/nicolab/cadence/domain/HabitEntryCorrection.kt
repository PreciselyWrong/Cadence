package ch.nicolab.cadence.domain

import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/**
 * Correction d'une saisie déjà enregistrée.
 *
 * L'identité et la session sont conservées : corriger n'est pas ressaisir. La date civile
 * et le fuseau retenus sont ceux réellement choisis lors de la correction, et l'instant en
 * découle — jamais l'inverse, pour qu'une correction passée reste attribuée à sa période.
 */
object HabitEntryCorrection {

    fun apply(
        entry: HabitEntry,
        valueMinor: Long,
        localDate: LocalDate? = null,
        localTime: LocalTime? = null,
        observedZoneId: ZoneId? = null,
        note: String? = null,
    ): HabitEntry {
        require(valueMinor > 0) { "Entry value must be positive" }

        val zone = observedZoneId ?: entry.observedZoneId
        val movedInTime = localDate != null || localTime != null || observedZoneId != null

        val occurredAt = if (!movedInTime) {
            entry.occurredAt
        } else {
            val date = localDate ?: entry.localDate
            val time = localTime ?: entry.occurredAt.atZone(entry.observedZoneId).toLocalTime()
            // Une heure inexistante (passage à l'heure d'été) glisse sur l'instant valide
            // suivant, ce que `atZone` fait déjà : la date civile en reste inchangée.
            date.atTime(time).atZone(zone).toInstant()
        }

        val civilDate = occurredAt.atZone(zone).toLocalDate()

        return entry.copy(
            occurredAt = occurredAt,
            localDate = civilDate,
            observedZoneId = zone,
            valueMinor = valueMinor,
            note = note?.trim()?.ifBlank { null } ?: entry.note.takeIf { note == null },
        )
    }
}
