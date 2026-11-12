package ch.nicolab.cadence.tasks.planning

import java.time.LocalDate

/**
 * Ranger à la main les tâches sans heure d'un jour (web : `reorderWrites`) : l'ordre est celui du plan du jour, le même
 * sur tous les clients. La tâche déplacée se pose devant la première tâche prévue qui la suit dans le nouvel ordre ;
 * une tâche prévue est rangée (`reorder`), une tâche seulement due est ajoutée au plan à cette place (`add`).
 */
internal object TodayReorder {
    /**
     * [untimed] : les tâches sans heure du jour, dans l'ordre affiché ; [planned] : celles que le plan du jour tient ;
     * [uid] va au rang [toIndex] de [untimed]. Rien si elle ne bouge pas.
     */
    fun writes(day: LocalDate, untimed: List<String>, planned: Set<String>, uid: String, toIndex: Int): List<PlanEdit> {
        val from = untimed.indexOf(uid)
        if (from == -1 || toIndex == from || toIndex !in untimed.indices) return emptyList()
        val order = untimed.toMutableList().apply { add(toIndex, removeAt(from)) }
        val before = order.drop(toIndex + 1).firstOrNull { it in planned && it != uid }
        return listOf(if (uid in planned) ReorderTask(day, uid, before) else AddTask(day, uid, before))
    }
}
