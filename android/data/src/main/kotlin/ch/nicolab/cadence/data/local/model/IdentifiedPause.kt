package ch.nicolab.cadence.data.local.model

import ch.nicolab.cadence.domain.HabitPause

/** Une pause et son identifiant persistant, pour l'annuler ou l'écourter. */
data class IdentifiedPause(
    val id: String,
    val habitId: String,
    val pause: HabitPause,
)
