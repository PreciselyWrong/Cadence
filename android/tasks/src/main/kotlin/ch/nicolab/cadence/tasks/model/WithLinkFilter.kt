package ch.nicolab.cadence.tasks.model

/** Filtre « Avec un lien » des listes de tâches : le nom ou la note contient une adresse `http://` ou `https://`. */
object WithLinkFilter {
    private val schemes = listOf("http://", "https://")

    fun matches(name: String, note: String?): Boolean =
        schemes.any { name.contains(it, ignoreCase = true) || note?.contains(it, ignoreCase = true) == true }

    fun tasks(tasks: List<TaskItem>, on: Boolean): List<TaskItem> =
        if (on) tasks.filter { matches(it.name, it.note) } else tasks
}
