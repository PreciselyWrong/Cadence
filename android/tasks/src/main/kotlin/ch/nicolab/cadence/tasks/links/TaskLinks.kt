package ch.nicolab.cadence.tasks.links

import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskSources

/**
 * La page vers laquelle pointe une tâche : la première adresse de sa note, montrée sur sa ligne par l'icône et le nom
 * du site avec l'image de la page (`docs/37-links.md`, « Rows » ; web : `components/Links/taskLink.ts`).
 * [noteRest] : la note sans cette adresse ; [iconInBadge] : la pastille d'origine montre déjà l'icône de ce site.
 */
data class TaskLink(val url: String, val host: String, val noteRest: String, val iconInBadge: Boolean)

object TaskLinks {
    fun of(task: TaskItem): TaskLink? {
        val note = task.note ?: return null
        val url = LinkExtractor.urls(note, limit = 1).firstOrNull() ?: return null
        val host = LinkExtractor.domain(url) ?: return null
        val badgeHost = TaskSources.of(task)?.url?.let(LinkExtractor::domain)
        return TaskLink(url, host, note.replaceFirst(url, "").trim(), badgeHost == host)
    }
}
