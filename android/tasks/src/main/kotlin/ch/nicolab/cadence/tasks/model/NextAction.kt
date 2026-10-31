package ch.nicolab.cadence.tasks.model

/**
 * Prochaine action d'un projet (docs/06-projects.md, point 11) : une tâche ouverte du projet, choisie
 * par l'utilisateur. Le serveur efface le choix à la clôture ; ici, une valeur périmée n'est simplement pas montrée.
 */
object NextAction {
    /** La tâche désignée par [project], si elle est encore ouverte et dans ce projet. */
    fun of(project: ProjectItem, tasks: List<TaskItem>): TaskItem? {
        val uid = project.nextTaskUid ?: return null
        return tasks.firstOrNull { it.uid == uid && it.projectUid == project.uid && !it.isClosed }
    }

    /** Peut-on désigner [task] ? Ouverte, dans un projet, pas une sous-tâche ni un projet-fichier. */
    fun canDesignate(task: TaskItem): Boolean =
        task.projectUid != null && !task.isClosed && task.parentTaskUid == null && !task.fileBacked

    fun isDesignated(task: TaskItem, projects: List<ProjectItem>): Boolean =
        task.projectUid != null && projects.any { it.uid == task.projectUid && it.nextTaskUid == task.uid }

    /** Projet → tâche désignée, pour les seuls projets qui en ont une. */
    fun byProject(projects: List<ProjectItem>): Map<String, String> =
        projects.mapNotNull { project -> project.nextTaskUid?.let { project.uid to it } }.toMap()
}
