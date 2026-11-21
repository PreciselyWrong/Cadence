package ch.nicolab.cadence.tasks.model

/** Colonne du tableau Kanban d'un projet : `uid == null` désigne « Sans section ». */
data class BoardColumn(
    val uid: String?,
    val name: String?,
    val position: Int?,
    val tasks: List<TaskItem>,
)

/** Règles pures du tableau Kanban d'un projet (construction des colonnes, tri et placements au dépôt). */
object ProjectBoard {
    /**
     * Trie les cartes d'une colonne comme le web (`byPosition`) :
     * celles qui ont une `sectionPosition` d'abord par ordre croissant, puis les autres dans leur ordre d'arrivée.
     */
    fun sortCards(tasks: List<TaskItem>): List<TaskItem> =
        tasks.withIndex()
            .sortedWith { a, b ->
                val pa = a.value.sectionPosition
                val pb = b.value.sectionPosition
                when {
                    pa == null && pb == null -> a.index.compareTo(b.index)
                    pa == null -> 1
                    pb == null -> -1
                    pa != pb -> pa.compareTo(pb)
                    else -> a.index.compareTo(b.index)
                }
            }
            .map { it.value }

    /**
     * Construit les colonnes du tableau : « Sans section » en premier (y compris toute tâche pointant
     * vers une section inconnue), suivie des sections triées par `(position, uid)`.
     */
    fun buildColumns(sections: List<ProjectSectionItem>, tasks: List<TaskItem>): List<BoardColumn> {
        val sortedSections = sections.sortedWith(compareBy<ProjectSectionItem> { it.position }.thenBy { it.uid })
        val known = sortedSections.map { it.uid }.toSet()
        val buckets = LinkedHashMap<String?, MutableList<TaskItem>>()
        buckets[null] = mutableListOf()
        for (section in sortedSections) {
            buckets[section.uid] = mutableListOf()
        }
        for (task in tasks) {
            val key = task.sectionUid?.takeIf { it in known }
            buckets.getValue(key).add(task)
        }
        val result = ArrayList<BoardColumn>(sortedSections.size + 1)
        result += BoardColumn(uid = null, name = null, position = null, tasks = sortCards(buckets.getValue(null)))
        for (section in sortedSections) {
            result += BoardColumn(
                uid = section.uid,
                name = section.name,
                position = section.position,
                tasks = sortCards(buckets.getValue(section.uid)),
            )
        }
        return result
    }

    /**
     * Calcule les écritures nécessaires pour placer [taskUid] dans la colonne [targetSectionUid]
     * juste avant [beforeTaskUid] (ou en fin de colonne si null).
     * Retourne uniquement les tâches dont la section ou la position change.
     */
    fun movePlacements(
        columns: List<BoardColumn>,
        taskUid: String,
        targetSectionUid: String?,
        beforeTaskUid: String? = null,
    ): List<BoardTaskPlacement> {
        val targetCol = columns.firstOrNull { it.uid == targetSectionUid } ?: return emptyList()
        val taskByUid = columns.asSequence().flatMap { it.tasks.asSequence() }.associateBy { it.uid }
        if (taskUid !in taskByUid) return emptyList()

        val orderedUids = targetCol.tasks
            .map { it.uid }
            .filter { it != taskUid }
            .toMutableList()

        val insertAt = beforeTaskUid?.let { orderedUids.indexOf(it) } ?: -1
        if (insertAt in 0..orderedUids.size) {
            orderedUids.add(insertAt, taskUid)
        } else {
            orderedUids.add(taskUid)
        }

        val currentUids = targetCol.tasks.map { it.uid }
        if (taskByUid[taskUid]?.sectionUid == targetSectionUid && currentUids == orderedUids) {
            return emptyList()
        }

        return orderedUids.mapIndexedNotNull { index, uid ->
            val current = taskByUid[uid] ?: return@mapIndexedNotNull null
            if (current.sectionUid == targetSectionUid && current.sectionPosition == index) {
                null
            } else {
                BoardTaskPlacement(taskUid = uid, sectionUid = targetSectionUid, sectionPosition = index)
            }
        }
    }
}
