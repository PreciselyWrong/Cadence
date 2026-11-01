package ch.nicolab.cadence.tasks.model

/** Une étiquette de l'arbre : [children] sont les étiquettes qui la suivent dans le même espace de noms. */
data class TagNode(val tag: TagItem, val children: List<TagNode>)

/** Ligne d'un arbre aplati : [label] est le nom court sous son parent, le chemin complet à la racine. */
data class TagTreeRow(val tag: TagItem, val label: String, val depth: Int, val hasChildren: Boolean)

/**
 * Étiquettes imbriquées, comme sur le web (`frontend/utils/tagTree.ts`) : le nom d'une étiquette est son
 * chemin complet (`perso/sport/course`), à toute profondeur. Le nom fait foi, pas `parent_uid` : une
 * étiquette dont le parent direct manque se rattache à son plus proche ancêtre présent, sinon à la racine.
 */
object TagPaths {
    const val SEPARATOR = '/'

    /** Dernier segment du chemin : ce qu'une ligne d'arbre montre sous son parent. */
    fun leaf(name: String): String = name.substring(name.lastIndexOf(SEPARATOR) + 1)

    /** [name] est [ancestor] ou une étiquette de son espace de noms (`perso2` n'est pas sous `perso`). */
    fun isSameOrDescendant(name: String, ancestor: String): Boolean =
        name == ancestor || name.startsWith(ancestor + SEPARATOR)

    /** Les uid de [uids] et de toutes les étiquettes sous elles : filtrer par un parent inclut ses sous-étiquettes. */
    fun withDescendants(tags: List<TagItem>, uids: Set<String>): Set<String> {
        if (uids.isEmpty()) return emptySet()
        val roots = tags.filter { it.uid in uids }.map { it.name }
        return tags.filter { tag -> roots.any { isSameOrDescendant(tag.name, it) } }.mapTo(HashSet(uids)) { it.uid }
    }

    fun tree(tags: List<TagItem>): List<TagNode> {
        val byName = tags.associateBy { it.name }
        val childrenOf = HashMap<String?, MutableList<TagItem>>()
        tags.forEach { tag -> childrenOf.getOrPut(nearestListedAncestor(tag.name, byName)) { mutableListOf() }.add(tag) }
        fun build(parent: String?): List<TagNode> = childrenOf[parent].orEmpty()
            .sortedBy { it.name.lowercase() }
            .map { TagNode(it, build(it.name)) }
        return build(null)
    }

    /** Lignes de l'arbre en profondeur d'abord ; les enfants d'une étiquette repliée (son uid) sont omis. */
    fun rows(tags: List<TagItem>, collapsed: Set<String> = emptySet()): List<TagTreeRow> {
        fun walk(nodes: List<TagNode>, parent: TagItem?, depth: Int): List<TagTreeRow> = nodes.flatMap { node ->
            val label = parent?.let { node.tag.name.removePrefix(it.name + SEPARATOR) } ?: node.tag.name
            val row = TagTreeRow(node.tag, label, depth, node.children.isNotEmpty())
            if (node.tag.uid in collapsed) listOf(row) else listOf(row) + walk(node.children, node.tag, depth + 1)
        }
        return walk(tree(tags), null, 0)
    }

    private fun nearestListedAncestor(name: String, byName: Map<String, TagItem>): String? {
        var path = name
        while (path.contains(SEPARATOR)) {
            path = path.substring(0, path.lastIndexOf(SEPARATOR))
            if (path in byName) return path
        }
        return null
    }
}
