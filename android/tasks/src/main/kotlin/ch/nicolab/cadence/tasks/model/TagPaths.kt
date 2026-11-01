package ch.nicolab.cadence.tasks.model

/** Une étiquette de l'arbre : [children] sont les étiquettes qui la suivent dans le même espace de noms. */
data class TagNode(val tag: TagItem, val children: List<TagNode>)

/** Ligne d'un arbre aplati : [label] est le nom court sous son parent, le chemin complet à la racine. */
data class TagTreeRow(val tag: TagItem, val label: String, val depth: Int, val hasChildren: Boolean)

/** Pourquoi un renommage ou un déplacement d'étiquette est refusé. */
enum class TagEditProblem { UNKNOWN, INVALID, UNCHANGED, RESERVED, INTO_SELF, CLASH }

/** Nouveau nom (chemin complet) et parent d'une étiquette après un renommage. */
data class TagRename(val uid: String, val name: String, val parentUid: String?)

/** Résultat de [TagPaths.plan] : ce qu'il faut écrire, ou la raison du refus. */
sealed interface TagEditPlan {
    /** [root] est l'étiquette modifiée, la seule envoyée au serveur ; [cascaded] suit son renommage (le serveur fait de même). */
    data class Apply(val root: TagRename, val cascaded: List<TagRename>) : TagEditPlan

    data class Rejected(val problem: TagEditProblem) : TagEditPlan
}

/**
 * Étiquettes imbriquées, comme sur le web (`frontend/utils/tagTree.ts`) : le nom d'une étiquette est son
 * chemin complet (`perso/sport/course`), à toute profondeur. Le nom fait foi, pas `parent_uid` : une
 * étiquette dont le parent direct manque se rattache à son plus proche ancêtre présent, sinon à la racine.
 */
object TagPaths {
    const val SEPARATOR = '/'

    /** Étiquette système de « Plus tard » (`review/repository.js` du serveur) : son nom ne change pas. */
    const val SOMEDAY = "someday"

    private const val MAX_SEGMENT_LENGTH = 50
    private const val MAX_LENGTH = 200
    private const val INVALID_CHARS = "#%&{}\\<>*?\$!'\"@+`|="

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

    /** Chemin du parent direct de [name] ; null à la racine. */
    fun parentPath(name: String): String? = name.substringBeforeLast(SEPARATOR, "").ifEmpty { null }

    /** [name] dont le dernier segment devient [leaf] : le renommage d'une étiquette sans changer de parent. */
    fun renamedLeaf(name: String, leaf: String): String = parentPath(name)?.let { it + SEPARATOR + leaf } ?: leaf

    /** Chemin de [leaf] sous [parent] (à la racine si null). */
    fun pathUnder(parent: TagItem?, leaf: String): String = parent?.let { it.name + SEPARATOR + leaf } ?: leaf

    /**
     * Nom normalisé comme le serveur (`modules/tags/validation.js`) : segments rognés, aucun vide, 50 caractères
     * au plus par segment, 200 au total, sans caractère interdit. Null si le nom est refusé.
     */
    fun normalize(name: String): String? {
        val segments = name.split(SEPARATOR).map { it.trim() }
        if (segments.any { it.isEmpty() || it.length > MAX_SEGMENT_LENGTH || it.any { c -> c in INVALID_CHARS } }) return null
        return segments.joinToString(SEPARATOR.toString()).takeIf { it.length <= MAX_LENGTH }
    }

    /** Étiquettes qui peuvent devenir le parent de [uid] : toutes sauf elle, ses sous-étiquettes et « Plus tard ». */
    fun parentCandidates(tags: List<TagItem>, uid: String): List<TagItem> {
        val self = tags.firstOrNull { it.uid == uid } ?: return emptyList()
        return tags.filter { !isSameOrDescendant(it.name, self.name) && it.name != SOMEDAY }.sortedBy { it.name.lowercase() }
    }

    /** Nom de [uid] une fois placée sous [parentUid] (à la racine si null) ; null si l'étiquette ou le parent est inconnu. */
    fun moveTarget(tags: List<TagItem>, uid: String, parentUid: String?): String? {
        val tag = tags.firstOrNull { it.uid == uid } ?: return null
        val parent = parentUid?.let { id -> tags.firstOrNull { it.uid == id } ?: return null }
        return pathUnder(parent, leaf(tag.name))
    }

    /**
     * Renomme [uid] en [requestedName] (chemin complet) : ses sous-étiquettes suivent, car le nom porte le chemin.
     * Refusé quand le nom est invalide, inchangé, sous elle-même ou l'un de ses enfants, déjà pris par une autre
     * étiquette, ou quand l'étiquette est « Plus tard ». Même règles que `models/tag.js` du serveur.
     */
    fun plan(tags: List<TagItem>, uid: String, requestedName: String): TagEditPlan {
        val tag = tags.firstOrNull { it.uid == uid } ?: return TagEditPlan.Rejected(TagEditProblem.UNKNOWN)
        if (tag.name == SOMEDAY) return TagEditPlan.Rejected(TagEditProblem.RESERVED)
        val newName = normalize(requestedName) ?: return TagEditPlan.Rejected(TagEditProblem.INVALID)
        if (newName == tag.name) return TagEditPlan.Rejected(TagEditProblem.UNCHANGED)
        if (newName.startsWith(tag.name + SEPARATOR)) return TagEditPlan.Rejected(TagEditProblem.INTO_SELF)
        val subtree = tags.filter { isSameOrDescendant(it.name, tag.name) }
        val renamed = subtree.associate { it.uid to newName + it.name.substring(tag.name.length) }
        val others = tags.filter { it.uid !in renamed }
        if (renamed.values.any { name -> others.any { it.name == name } }) return TagEditPlan.Rejected(TagEditProblem.CLASH)
        val byName = (others.map { it.name to it.uid } + renamed.map { (id, name) -> name to id }).toMap()
        fun entry(id: String): TagRename {
            val name = renamed.getValue(id)
            val parentName = name.substringBeforeLast(SEPARATOR, "").ifEmpty { null }
            return TagRename(id, name, parentName?.let(byName::get))
        }
        return TagEditPlan.Apply(entry(uid), subtree.filter { it.uid != uid }.map { entry(it.uid) })
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
