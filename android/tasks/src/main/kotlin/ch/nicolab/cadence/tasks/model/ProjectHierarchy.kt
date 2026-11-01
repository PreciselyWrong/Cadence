package ch.nicolab.cadence.tasks.model

/** Un sous-projet direct avec ses tâches ouvertes, comme la ligne « dossier » du web. */
data class SubProject(val project: ProjectItem, val openCount: Int)

/** Sous-projets (`parent_project_uid`) : lignes sur la page du parent et fil d'Ariane sur celle de l'enfant. */
object ProjectHierarchy {
    /** Parents de [uid], la racine d'abord, sans [uid] ; un parent absent ou une boucle arrête la remontée. */
    fun ancestors(projects: List<ProjectItem>, uid: String): List<ProjectItem> {
        val byUid = projects.associateBy { it.uid }
        val chain = ArrayDeque<ProjectItem>()
        val seen = hashSetOf(uid)
        var parentUid = byUid[uid]?.parentProjectUid
        while (parentUid != null && seen.add(parentUid)) {
            val parent = byUid[parentUid] ?: break
            chain.addFirst(parent)
            parentUid = parent.parentProjectUid
        }
        return chain.toList()
    }

    /** Sous-projets directs de [parentUid] par nom, avec leurs tâches ouvertes ; les tâches ne remontent pas au parent. */
    fun children(projects: List<ProjectItem>, parentUid: String, tasks: List<TaskItem>): List<SubProject> {
        val open = tasks.filter { !it.isClosed && it.projectUid != null }.groupingBy { it.projectUid }.eachCount()
        return projects.filter { it.parentProjectUid == parentUid && it.uid != parentUid }
            .sortedBy { it.name.lowercase() }
            .map { SubProject(it, open[it.uid] ?: 0) }
    }
}
