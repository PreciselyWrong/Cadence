package ch.nicolab.cadence.tasks.model

/** L'ordre de la liste Aujourd'hui, choisi à la main : le champ synchronisé `today_order`, le même que sur le web. */
object TodayOrder {
    fun of(task: TaskItem): Int? = task.extras["today_order"]?.toDoubleOrNull()?.toInt()

    /** Ce qui est rangé à la main d'abord, dans cet ordre ; le reste garde sa place relative. */
    fun apply(tasks: List<TaskItem>): List<TaskItem> {
        val (placed, rest) = tasks.partition { of(it) != null }
        return placed.sortedBy { of(it) } + rest
    }

    /** La liste une fois [uid] déplacé de [delta] rangs ; inchangée au bord ou si la tâche n'y est pas. */
    fun moved(uids: List<String>, uid: String, delta: Int): List<String> {
        val from = uids.indexOf(uid)
        val to = from + delta
        if (from == -1 || to !in uids.indices) return uids
        return uids.toMutableList().apply { add(to, removeAt(from)) }
    }

    /** Les rangs à écrire : seulement ceux qui changent, pour ne pas synchroniser toute la liste. */
    fun changes(ordered: List<TaskItem>): List<Pair<String, Int>> =
        ordered.mapIndexedNotNull { rank, task -> if (of(task) == rank) null else task.uid to rank }
}
