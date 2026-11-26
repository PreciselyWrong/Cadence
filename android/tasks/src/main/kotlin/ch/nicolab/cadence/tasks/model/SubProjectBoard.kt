package ch.nicolab.cadence.tasks.model

import java.time.Duration
import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** « État actuel » d'un projet TODO.md (`handoff_state`) : ce que le tableau des sous-projets en montre. */
data class ProjectHandoff(
    val nextAction: String? = null,
    val blockers: String? = null,
    val branch: String? = null,
    val tree: String? = null,
    /** Dernière relecture du fichier par le serveur (`updated_at`) : sert à repérer un état périmé. */
    val updatedAt: Instant? = null,
) {
    companion object {
        /** Lit l'objet JSON du serveur ; un texte absent ou illisible donne null. */
        fun parse(json: String?): ProjectHandoff? {
            val state = json?.let { runCatching { Json.parseToJsonElement(it) as? JsonObject }.getOrNull() } ?: return null
            return ProjectHandoff(
                nextAction = state.text("next_action"),
                blockers = state.text("blockers"),
                branch = state.text("branch"),
                tree = state.text("tree"),
                updatedAt = state.text("updated_at")?.let { runCatching { Instant.parse(it) }.getOrNull() },
            )
        }

        private fun JsonObject.text(key: String): String? =
            (this[key] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
    }
}

enum class ProjectHealth { BLOCKED, STALE, OK }

/** Règles pures du tableau « Tâches par projet » d'un projet parent, comme le web (`boardModel.ts`). */
object SubProjectBoard {
    /** Un état actuel plus vieux que cela est périmé (une revue de projet toutes les deux semaines). */
    const val STALE_DAYS = 14L

    /** Cartes montrées par section avant « Afficher les N autres ». */
    const val SECTION_FOLD = 8

    private val knownSections = listOf("now", "next", "ideas")

    /** Un bloqueur, sinon un fichier resté immobile plus de [STALE_DAYS] jours, sinon en bonne voie ; null sans état actuel. */
    fun health(handoff: ProjectHandoff?, now: Instant): ProjectHealth? {
        if (handoff == null) return null
        if (handoff.blockers != null) return ProjectHealth.BLOCKED
        val updatedAt = handoff.updatedAt ?: return ProjectHealth.OK
        return if (Duration.between(updatedAt, now) > Duration.ofDays(STALE_DAYS)) ProjectHealth.STALE else ProjectHealth.OK
    }

    /** Jours entiers écoulés depuis la dernière relecture ; null sans date. */
    fun ageDays(handoff: ProjectHandoff?, now: Instant): Int? =
        handoff?.updatedAt?.let { Duration.between(it, now).toDays().toInt() }

    /** Colonne du tableau : le projet parent lui-même ou l'un de ses sous-projets directs. */
    data class Column(val project: ProjectItem, val tasks: List<TaskItem>, val isParent: Boolean)

    /**
     * Le parent d'abord s'il a des tâches ouvertes, puis ses sous-projets directs en cours qui en ont, par nom.
     * Les sous-tâches ne comptent pas : elles se lisent dans la fiche de leur tâche.
     */
    fun columns(parent: ProjectItem, projects: List<ProjectItem>, tasks: List<TaskItem>): List<Column> {
        val open = tasks.filter { !it.isClosed && it.parentTaskUid == null && it.projectUid != null }.groupBy { it.projectUid }
        val subProjects = ProjectHierarchy.children(projects, parent.uid, tasks)
            .map { it.project }
            .filter { it.projectStatus == ProjectStatus.IN_PROGRESS }
        return (listOf(parent to true) + subProjects.map { it to false })
            .mapNotNull { (project, isParent) ->
                open[project.uid]?.takeIf { it.isNotEmpty() }?.let { Column(project, it, isParent) }
            }
    }

    /** Les tâches d'une colonne regroupées par section du fichier ; [label] null : tâches qui ne sont dans aucune section. */
    data class SectionGroup(val label: String?, val tasks: List<TaskItem>, val showTitle: Boolean)

    /**
     * Now, Next, Ideas, puis les autres sections du fichier dans leur ordre d'apparition, puis les tâches sans section ;
     * dans chaque section, l'ordre des puces du fichier d'abord, puis les tâches nées dans Cadence dans leur ordre d'arrivée.
     * Le groupe sans section ne porte de titre que s'il existe aussi une section nommée.
     */
    fun groupBySection(tasks: List<TaskItem>): List<SectionGroup> {
        val groups = LinkedHashMap<String, Pair<String?, MutableList<TaskItem>>>()
        for (task in tasks) {
            val label = task.sourceSection?.trim()?.takeIf { it.isNotEmpty() }
            groups.getOrPut(label?.lowercase().orEmpty()) { label to mutableListOf() }.second.add(task)
        }
        fun rank(key: String): Int = when {
            key.isEmpty() -> Int.MAX_VALUE
            else -> knownSections.indexOf(key).takeIf { it >= 0 } ?: knownSections.size
        }
        val named = groups.keys.any { it.isNotEmpty() }
        return groups.entries
            .sortedBy { rank(it.key) }
            .map { (_, group) ->
                val (label, members) = group
                SectionGroup(label, members.sortedBy { it.sourcePosition ?: Int.MAX_VALUE }, showTitle = label != null || named)
            }
    }

    /** Cartes à montrer d'une section et nombre de cartes repliées derrière « Afficher les N autres ». */
    data class Folded(val shown: List<TaskItem>, val hidden: Int)

    fun fold(tasks: List<TaskItem>, expanded: Boolean): Folded =
        if (expanded || tasks.size <= SECTION_FOLD) Folded(tasks, 0) else Folded(tasks.take(SECTION_FOLD), tasks.size - SECTION_FOLD)
}
