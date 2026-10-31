package ch.nicolab.cadence.tasks.model

/** Filtre « domaine » des listes de tâches et de projets : une tâche suit son domaine, sinon celui de son projet. */
object AreaFilter {
    fun areaOf(task: TaskItem, projects: List<ProjectItem>): String? =
        task.areaUid ?: task.projectUid?.let { uid -> projects.firstOrNull { it.uid == uid }?.areaUid }

    fun tasks(tasks: List<TaskItem>, projects: List<ProjectItem>, areaUid: String?): List<TaskItem> {
        if (areaUid == null) return tasks
        val projectAreas = projects.associate { it.uid to it.areaUid }
        return tasks.filter { (it.areaUid ?: it.projectUid?.let(projectAreas::get)) == areaUid }
    }

    fun projects(projects: List<ProjectItem>, areaUid: String?): List<ProjectItem> =
        if (areaUid == null) projects else projects.filter { it.areaUid == areaUid }
}

/** « Proposer 5 domaines » : seuls les noms absents sont créés, sans tenir compte de la casse. */
object AreaSuggestions {
    fun missing(existing: List<AreaItem>, suggested: List<String>): List<String> {
        val taken = existing.mapTo(hashSetOf()) { it.name.trim().lowercase() }
        return suggested.filter { taken.add(it.trim().lowercase()) }
    }
}
