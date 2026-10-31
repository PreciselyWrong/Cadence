package ch.nicolab.cadence.tasks.sync

import ch.nicolab.cadence.data.sync.HabitSyncStorage

/**
 * Les habitudes vivent dans la base de `:app` (une seule instance Room par processus, pour que les
 * écrans et les widgets voient les écritures de la synchro). L'application la branche ici dans
 * `Application.onCreate`, avant tout passage de synchronisation.
 */
object HabitSyncRegistry {
    @Volatile
    var storage: HabitSyncStorage? = null
}
