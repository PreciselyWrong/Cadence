package ch.nicolab.cadence.tasks.model

/** Avancement d'un tri en série : [total] éléments au départ, [remaining] encore à trier. */
data class TriageProgress(val total: Int, val remaining: Int) {
    val position: Int get() = (total - remaining + 1).coerceIn(1, maxOf(total, 1))
}
