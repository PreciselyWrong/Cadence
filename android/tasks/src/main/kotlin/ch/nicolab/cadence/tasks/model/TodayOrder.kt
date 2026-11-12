package ch.nicolab.cadence.tasks.model

/**
 * Ancien ordre manuel d'Aujourd'hui, le champ synchronisé `today_order` : encore lu pour les tâches hors du plan du jour.
 * Ranger écrit désormais l'ordre du plan du jour (`planning/TodayReorder`), le même que sur le web.
 */
object TodayOrder {
    fun of(task: TaskItem): Int? = task.extras["today_order"]?.toDoubleOrNull()?.toInt()

    /** Ce qui est rangé à la main d'abord, dans cet ordre ; le reste garde sa place relative. */
    fun apply(tasks: List<TaskItem>): List<TaskItem> {
        val (placed, rest) = tasks.partition { of(it) != null }
        return placed.sortedBy { of(it) } + rest
    }
}
