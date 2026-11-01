package ch.nicolab.cadence.tasks.model

/** Une tâche du projet et ses sous-tâches ouvertes, dans l'ordre affiché. */
data class OutlineNode(val task: TaskItem, val children: List<TaskItem>)

/** Une ligne de l'outliner : la tâche et son retrait (0 : tâche du projet, 1 : sous-tâche). */
data class OutlineRow(val task: TaskItem, val depth: Int, val hasChildren: Boolean)

/** Ce qu'une opération écrit pour une tâche : son parent ([parentUid], null : premier niveau) et son rang. */
data class OutlineMove(val uid: String, val parentUid: String?, val order: Int, val parentChanged: Boolean) {
    val change: TaskChange get() = when {
        !parentChanged -> TaskChange(order = order)
        parentUid == null -> TaskChange(order = order, clearParent = true)
        else -> TaskChange(order = order, parentTaskUid = parentUid)
    }
}

/** Place d'une nouvelle tâche sœur : son parent, son rang, et les rangs à décaler pour lui faire de la place. */
data class OutlineSlot(val parentUid: String?, val order: Int, val shifts: List<OutlineMove>)

/**
 * Outliner d'un projet, sans Android. Le retrait est le parent (`parent_task_uid`) : une sous-tâche est décalée
 * d'un cran, sur un seul niveau comme les sous-tâches du serveur ; le rang est le champ synchronisé `order`
 * du groupe de frères (le premier niveau d'un projet, ou les sous-tâches d'une tâche).
 */
object Outline {
    private const val NEW = "\u0000new"

    fun order(task: TaskItem): Int? = task.extras["order"]?.toDoubleOrNull()?.toInt()

    /** [top] : tâches ouvertes du projet ; [every] : toutes les tâches, pour leurs sous-tâches. */
    fun tree(top: List<TaskItem>, every: List<TaskItem>): List<OutlineNode> {
        val children = every.filter { it.parentTaskUid != null && !it.isClosed }.groupBy { it.parentTaskUid }
        return ranked(top, newestFirst = true).map { OutlineNode(it, ranked(children[it.uid].orEmpty(), newestFirst = false)) }
    }

    /**
     * Même ordre que le web (`sortByTaskOrder`, `ProjectOutline`) : les tâches jamais rangées (`order` vide) d'abord,
     * la plus récente d'abord au premier niveau, la plus ancienne d'abord parmi des sous-tâches ; puis par rang.
     * Une tâche créée ici et pas encore renvoyée par le serveur n'a pas de `created_at` : c'est la plus récente.
     */
    private fun ranked(tasks: List<TaskItem>, newestFirst: Boolean): List<TaskItem> {
        val (unranked, rankedTasks) = tasks.partition { order(it) == null }
        val byAge = compareBy<TaskItem, String?>(nullsLast()) { it.extras["created_at"] }
        val unrankedSorted = if (newestFirst) {
            unranked.sortedWith(compareBy<TaskItem, String?>(nullsFirst(reverseOrder())) { it.extras["created_at"] })
        } else {
            unranked.sortedWith(byAge)
        }
        return unrankedSorted + rankedTasks.sortedWith(compareBy<TaskItem> { order(it) }.then(byAge))
    }

    fun rows(tree: List<OutlineNode>): List<OutlineRow> = tree.flatMap { node ->
        listOf(OutlineRow(node.task, 0, node.children.isNotEmpty())) + node.children.map { OutlineRow(it, 1, false) }
    }

    /**
     * Une tâche de premier niveau, sans sous-tâche, qui n'est pas la première, se décale sous la précédente.
     * Une série ne devient pas une sous-tâche ni n'en reçoit : le serveur recopie les sous-tâches d'une série.
     */
    fun canIndent(tree: List<OutlineNode>, uid: String): Boolean {
        val index = tree.indexOfFirst { it.task.uid == uid }
        if (index <= 0) return false
        val node = tree[index]
        val target = tree[index - 1].task
        return node.children.isEmpty() && !node.task.isRecurring && !target.isRecurring
    }

    fun indent(tree: List<OutlineNode>, uid: String): List<OutlineNode>? {
        if (!canIndent(tree, uid)) return null
        val index = tree.indexOfFirst { it.task.uid == uid }
        val target = tree[index - 1]
        return tree.toMutableList().apply {
            this[index - 1] = target.copy(children = target.children + tree[index].task)
            removeAt(index)
        }
    }

    /** Une sous-tâche remonte au premier niveau, juste après son parent ; ses sœurs restent sous lui. */
    fun outdent(tree: List<OutlineNode>, uid: String): List<OutlineNode>? {
        val parentIndex = tree.indexOfFirst { node -> node.children.any { it.uid == uid } }
        if (parentIndex < 0) return null
        val parent = tree[parentIndex]
        val child = parent.children.first { it.uid == uid }
        return tree.toMutableList().apply {
            this[parentIndex] = parent.copy(children = parent.children - child)
            add(parentIndex + 1, OutlineNode(child, emptyList()))
        }
    }

    /** Échange avec la voisine du même groupe ; null au bord. */
    fun move(tree: List<OutlineNode>, uid: String, up: Boolean): List<OutlineNode>? {
        val step = if (up) -1 else 1
        val index = tree.indexOfFirst { it.task.uid == uid }
        if (index >= 0) {
            val other = index + step
            if (other !in tree.indices) return null
            return tree.toMutableList().apply { add(other, removeAt(index)) }
        }
        val parentIndex = tree.indexOfFirst { node -> node.children.any { it.uid == uid } }
        if (parentIndex < 0) return null
        val parent = tree[parentIndex]
        val childIndex = parent.children.indexOfFirst { it.uid == uid }
        val other = childIndex + step
        if (other !in parent.children.indices) return null
        val children = parent.children.toMutableList().apply { add(other, removeAt(childIndex)) }
        return tree.toMutableList().apply { this[parentIndex] = parent.copy(children = children) }
    }

    /** Où va une tâche sœur ajoutée après [uid] : même parent, rang suivant. */
    fun siblingSlot(tree: List<OutlineNode>, uid: String): OutlineSlot {
        val index = tree.indexOfFirst { it.task.uid == uid }
        val placeholder = { parent: String? -> TaskItem(uid = NEW, name = "", parentTaskUid = parent) }
        val (after, parentUid) = if (index >= 0) {
            tree.toMutableList().apply { add(index + 1, OutlineNode(placeholder(null), emptyList())) } to null
        } else {
            val parentIndex = tree.indexOfFirst { node -> node.children.any { it.uid == uid } }
            val parent = tree[parentIndex]
            val children = parent.children.toMutableList().apply { add(indexOfFirst { it.uid == uid } + 1, placeholder(parent.task.uid)) }
            tree.toMutableList().apply { this[parentIndex] = parent.copy(children = children) } to parent.task.uid
        }
        val moves = changes(tree, after)
        val slot = moves.first { it.uid == NEW }
        return OutlineSlot(parentUid, slot.order, moves.filterNot { it.uid == NEW })
    }

    /**
     * Ce qu'il faut écrire pour passer de [before] à [after]. Un groupe dont l'ordre change ou qui reçoit une tâche
     * est renuméroté 0..n (seules les tâches dont le rang ou le parent change sont écrites) ; un groupe qui ne fait
     * que perdre une tâche garde ses rangs.
     */
    fun changes(before: List<OutlineNode>, after: List<OutlineNode>): List<OutlineMove> {
        val oldGroups = groups(before)
        val oldParent = oldGroups.flatMap { (parent, members) -> members.map { it.uid to parent } }.toMap()
        return groups(after).flatMap { (parent, members) ->
            val previous = oldGroups[parent].orEmpty().map { it.uid }
            val uids = members.map { it.uid }
            if (uids == previous.filter { it in uids }) {
                emptyList()
            } else {
                members.mapIndexedNotNull { index, task ->
                    val moved = task.uid !in oldParent || oldParent[task.uid] != parent
                    if (!moved && order(task) == index) null else OutlineMove(task.uid, parent, index, parentChanged = moved)
                }
            }
        }
    }

    private fun groups(tree: List<OutlineNode>): Map<String?, List<TaskItem>> = buildMap {
        put(null, tree.map { it.task })
        tree.forEach { node -> if (node.children.isNotEmpty()) put(node.task.uid, node.children) }
    }
}
