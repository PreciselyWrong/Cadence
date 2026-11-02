package ch.nicolab.cadence

/**
 * Tâche à ouvrir dans l'onglet Tâches. L'extra d'un widget ou d'un rappel reste dans l'intent tant que
 * l'activité vit : il n'est servi qu'une fois, sinon chaque retour dans Tâches rouvrirait la tâche.
 */
internal data class TaskOpening(val pending: String? = null, val launchServed: Boolean = false) {
    fun fromLaunch(uid: String?): TaskOpening = if (uid == null || launchServed) this else TaskOpening(uid, launchServed = true)

    fun request(uid: String): TaskOpening = copy(pending = uid)

    fun consumed(): TaskOpening = copy(pending = null)

    fun save(): List<Any?> = listOf(pending, launchServed)

    companion object {
        fun restore(saved: List<Any?>): TaskOpening = TaskOpening(saved[0] as String?, saved[1] as Boolean)
    }
}
