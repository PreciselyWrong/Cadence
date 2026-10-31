package ch.nicolab.cadence.widget.today

import ch.nicolab.cadence.tasks.model.TaskItem

/** Ligne sous le titre : projet puis étiquettes (« 🌵Perso · #d1 #e1 ») ; null s'il n'y a rien à dire. */
internal fun taskMeta(task: TaskItem, projectNames: Map<String, String>, tagNames: Map<String, String>): String? {
    val project = task.projectUid?.let(projectNames::get)
    val tags = task.tagUids.mapNotNull(tagNames::get).joinToString(" ") { "#$it" }.takeIf { it.isNotEmpty() }
    return listOfNotNull(project, tags).joinToString(" · ").takeIf { it.isNotEmpty() }
}
