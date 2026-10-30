package ch.nicolab.cadence.tasks.search

import ch.nicolab.cadence.tasks.model.NoteItem
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.TaskItem

/** Transforme les données locales en lignes cherchables : le texte secondaire élargit ce qui est trouvé sans devenir un titre. */
object SearchSources {
    private const val MAX_CONTENT = 2_000

    fun tasks(tasks: List<TaskItem>, projectNames: Map<String, String>, tagNames: Map<String, String>): List<SearchEntry> =
        tasks.map { task ->
            val detail = buildList {
                task.note?.let(::add)
                task.projectUid?.let { projectNames[it] }?.let(::add)
                task.tagUids.mapNotNullTo(this) { tagNames[it] }
            }.joinToString(" ")
            SearchEntry(SearchKind.TASK, task.uid, task.name, detail, task.isClosed)
        }

    fun projects(projects: List<ProjectItem>): List<SearchEntry> =
        projects.map { SearchEntry(SearchKind.PROJECT, it.uid, it.name) }

    fun notes(notes: List<NoteItem>, tagNames: Map<String, String>): List<SearchEntry> =
        notes.map { note ->
            val detail = (listOf(note.content.take(MAX_CONTENT)) + note.tagUids.mapNotNull { tagNames[it] }).joinToString(" ")
            SearchEntry(SearchKind.NOTE, note.uid, note.title, detail)
        }
}
