package ch.nicolab.cadence.tasks.model

/** Projets proposés pour ranger une tâche : un projet terminé, abandonné ou archivé ne reçoit plus de travail. */
object ProjectChoices {
    /** Projets ouverts (actifs et stash), plus le projet actuel de la tâche même s'il est clos, pour qu'il reste marqué. */
    fun forTask(projects: List<ProjectItem>, currentUid: String?): List<ProjectItem> =
        projects.filter { !it.projectStatus.isClosed || it.uid == currentUid }
}
