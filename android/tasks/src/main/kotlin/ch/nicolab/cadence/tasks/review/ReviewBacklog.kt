package ch.nicolab.cadence.tasks.review

import ch.nicolab.cadence.tasks.links.LinkExtractor
import ch.nicolab.cadence.tasks.model.Decision
import ch.nicolab.cadence.tasks.model.LinkItem
import ch.nicolab.cadence.tasks.model.LinkLists
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.swipe.UndoChanges
import java.text.Normalizer
import java.time.Instant
import java.time.ZoneId

/** Noms connus du téléphone, uid → nom, pour titrer les groupes et filtrer. */
data class BacklogNames(
    val projects: Map<String, String> = emptyMap(),
    val areas: Map<String, String> = emptyMap(),
    val tags: Map<String, String> = emptyMap(),
)

/** Un groupe de « Plus tard » : un projet, un domaine pour une tâche sans projet, ou rien. */
data class BacklogGroup(val key: String, val kind: Kind, val name: String?, val items: List<ReviewTask>) {
    enum class Kind { PROJECT, AREA, NONE }
}

/**
 * « Plus tard » se parcourt comme un fonds : par projet (ou domaine, puis « Sans projet »), les groupes
 * touchés le plus récemment d'abord, un filtre sur le titre, le projet, les étiquettes et le titre du lien.
 * La liste reste celle du serveur ; seul l'ordre et le rangement sont faits ici.
 */
object ReviewBacklog {
    private const val NONE_KEY = "none"
    private const val LONG_LIST = 20

    fun groups(
        items: List<ReviewTask>,
        local: Map<String, TaskItem>,
        names: BacklogNames,
        query: String = "",
        linkTitles: Map<String, String> = emptyMap(),
    ): List<BacklogGroup> {
        val words = fold(query).split(Regex("\\s+")).filter { it.isNotEmpty() }
        val placed = items.map { item -> item to place(item, local[item.uid], names) }
            .filter { (item, place) -> words.isEmpty() || haystack(item, local[item.uid], place.name, names, linkTitles).let { text -> words.all { it in text } } }
        return placed.groupBy({ it.second }, { it.first })
            .map { (place, rows) -> BacklogGroup(place.key, place.kind, place.name, rows.sortedWith(rowOrder)) }
            .sortedWith(
                compareBy<BacklogGroup> { it.kind == BacklogGroup.Kind.NONE }
                    .thenByDescending { group -> group.items.maxOf { touched(it) } }
                    .thenBy { it.name?.lowercase() },
            )
    }

    /** Groupes ouverts d'emblée : tous pour une courte liste, sinon le plus récent seul, pour ne pas tout déverser. */
    fun defaultOpen(groups: List<BacklogGroup>, longAfter: Int = LONG_LIST): Set<String> =
        if (groups.sumOf { it.items.size } <= longAfter) groups.map { it.key }.toSet() else groups.take(1).map { it.key }.toSet()

    /**
     * Tri un par un : l'ordre de la liste, les tâches passées au bout dans l'ordre où elles ont été passées.
     * Une tâche décidée sort de [order] ; la file reprend donc où on l'a laissée.
     */
    fun queue(order: List<String>, skipped: List<String>): List<String> {
        val (passed, fresh) = order.partition { it in skipped }
        return fresh + passed.sortedBy { skipped.indexOf(it) }
    }

    /** Le texte qui porte le lien d'une ligne : le titre s'il contient une adresse, sinon une note qui n'est qu'un lien. */
    fun linkText(title: String, note: String?): String? = when {
        LinkExtractor.urls(title, 1).isNotEmpty() -> title
        note != null && LinkExtractor.isOnlyLink(note) -> note.trim()
        else -> null
    }

    /** Le lien enregistré d'une ligne : celui que le serveur a trouvé dans cette source, sinon la même page. */
    fun linkFor(links: List<LinkItem>, sourceType: String, uid: String, text: String): LinkItem? =
        LinkLists.forEntry(links, uid, text, sourceType)

    /** Ce que « Annuler » remet : seulement ce que la décision a changé (une date remise à l'identique compterait comme un déplacement). */
    fun undo(decision: Decision, task: TaskItem, zone: ZoneId): TaskChange = when (decision) {
        Decision.Today -> UndoChanges.restoreDue(task, zone).let { due ->
            UndoChanges.restoreFunnel(task).copy(dueDate = due.dueDate, dueTime = due.dueTime, clearDue = due.clearDue)
        }
        Decision.Drop -> TaskChange(status = task.status)
        else -> UndoChanges.restoreFunnel(task)
    }

    private data class Place(val key: String, val kind: BacklogGroup.Kind, val name: String?)

    private fun place(item: ReviewTask, task: TaskItem?, names: BacklogNames): Place {
        task?.projectUid?.let { uid -> return Place("project:$uid", BacklogGroup.Kind.PROJECT, names.projects[uid] ?: item.projectName) }
        if (task == null) item.projectName?.let { return Place("name:$it", BacklogGroup.Kind.PROJECT, it) }
        task?.areaUid?.let { uid -> names.areas[uid]?.let { return Place("area:$uid", BacklogGroup.Kind.AREA, it) } }
        return Place(NONE_KEY, BacklogGroup.Kind.NONE, null)
    }

    private fun touched(item: ReviewTask): Instant = item.lastActivityAt ?: item.reviewedAt ?: Instant.EPOCH

    private val rowOrder = compareByDescending<ReviewTask> { it.reviewDue }
        .thenByDescending { touched(it) }
        .thenBy { it.name.lowercase() }

    private fun haystack(item: ReviewTask, task: TaskItem?, group: String?, names: BacklogNames, linkTitles: Map<String, String>): String = fold(
        listOfNotNull(
            item.name,
            group,
            linkTitles[item.uid],
            *task?.tagUids.orEmpty().mapNotNull { names.tags[it] }.toTypedArray(),
        ).joinToString(" "),
    )

    private fun fold(text: String): String =
        Normalizer.normalize(text, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase()
}
