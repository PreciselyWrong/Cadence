package ch.nicolab.cadence.widget.today

import ch.nicolab.cadence.tasks.model.TagColor
import ch.nicolab.cadence.tasks.model.TaskItem

/** Ligne sous le titre : projet puis étiquettes (« 🌵Perso · #d1 #e1 ») ; null s'il n'y a rien à dire. */
internal fun taskMeta(task: TaskItem, projectNames: Map<String, String>, tagNames: Map<String, String>): String? {
    val project = task.projectUid?.let(projectNames::get)
    val tags = task.tagUids.mapNotNull(tagNames::get).joinToString(" ") { "#$it" }.takeIf { it.isNotEmpty() }
    return listOfNotNull(project, tags).joinToString(" · ").takeIf { it.isNotEmpty() }
}

/** Une étiquette de la ligne sous le titre, avec sa couleur : le widget la dessine en point coloré suivi de `#nom`. */
internal data class MetaTag(val name: String, val color: TagColor)

/** Étiquettes connues de [task], dans l'ordre de la tâche. */
internal fun taskMetaTags(task: TaskItem, tagNames: Map<String, String>, tagColors: Map<String, TagColor>): List<MetaTag> =
    task.tagUids.mapNotNull { uid ->
        val name = tagNames[uid] ?: return@mapNotNull null
        tagColors[uid]?.let { MetaTag(name, it) }
    }
