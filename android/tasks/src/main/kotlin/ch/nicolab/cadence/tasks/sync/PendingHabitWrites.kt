package ch.nicolab.cadence.tasks.sync

/** Écritures d'habitudes comptées dans « N modifications en attente » : aucune tant que la synchro est coupée (autre compte). */
internal fun pendingHabitWrites(count: Int, foreign: Boolean): Int = if (foreign) 0 else count
