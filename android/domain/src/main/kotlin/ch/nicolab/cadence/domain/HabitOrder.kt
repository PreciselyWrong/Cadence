package ch.nicolab.cadence.domain

/** Une habitude vue par son rang : seul l'ordre compte, pas le reste de la fiche. */
data class OrderSlot(val id: String, val sortOrder: Int)

/**
 * Ordre des habitudes d'un groupe, dans l'ordre affiché. Un déplacement renumérote le groupe 0..n :
 * deux rangs égaux ne peuvent pas masquer un échange, et le même calcul vaut sur le web.
 */
object HabitOrder {
    /** Nouveaux rangs après un déplacement d'un cran (-1 monte, +1 descend), seulement ceux qui changent. */
    fun movePatches(group: List<OrderSlot>, id: String, direction: Int): Map<String, Int> {
        val from = group.indexOfFirst { it.id == id }
        val to = from + direction
        if (from < 0 || to !in group.indices) return emptyMap()
        val order = group.toMutableList()
        order[from] = order[to].also { order[to] = order[from] }
        return order.withIndex()
            .filter { (index, slot) -> slot.sortOrder != index }
            .associate { (index, slot) -> slot.id to index }
    }

    /** Rang d'une copie : à la fin du groupe. */
    fun nextSortOrder(group: List<OrderSlot>): Int = (group.maxOfOrNull { it.sortOrder } ?: -1) + 1
}
