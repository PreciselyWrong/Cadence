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

    /** Tous les sous-projets de [uid], à toute profondeur ; une boucle dans les données ne fait pas tourner la recherche. */
    fun descendants(projects: List<ProjectItem>, uid: String): Set<String> {
        val childrenOf = projects.filter { it.parentProjectUid != null }.groupBy { it.parentProjectUid }
        val found = linkedSetOf<String>()
        val queue = ArrayDeque(listOf(uid))
        while (queue.isNotEmpty()) {
            childrenOf[queue.removeFirst()].orEmpty().forEach { child ->
                if (child.uid != uid && found.add(child.uid)) queue.add(child.uid)
            }
        }
        return found
    }

    /**
     * [uid] peut passer sous [parentUid] (null : au premier niveau) : le projet existe, le parent aussi, et ce
     * n'est ni lui-même ni l'un de ses sous-projets (le serveur refuse ces deux cas, `invalid_hierarchy`).
     */
    fun canMove(projects: List<ProjectItem>, uid: String, parentUid: String?): Boolean {
        if (projects.none { it.uid == uid }) return false
        if (parentUid == null) return true
        if (parentUid == uid || projects.none { it.uid == parentUid }) return false
        return parentUid !in descendants(projects, uid)
    }

    /** Parents possibles de [uid] par nom : tous les projets sauf lui et ses sous-projets. */
    fun parentCandidates(projects: List<ProjectItem>, uid: String): List<ProjectItem> {
        val excluded = descendants(projects, uid) + uid
        return projects.filter { it.uid !in excluded }.sortedBy { it.name.lowercase() }
    }
}
