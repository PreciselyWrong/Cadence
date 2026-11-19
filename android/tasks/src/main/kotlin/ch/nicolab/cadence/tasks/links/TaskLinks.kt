package ch.nicolab.cadence.tasks.links

import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskSources
import java.net.URI

/**
 * La page vers laquelle pointe une tâche : la première adresse de sa note, sinon une adresse saisie comme nom,
 * montrée sur sa ligne par l'icône et le nom du site avec l'image de la page (`docs/37-links.md`, « Rows » ;
 * web : `components/Links/taskLink.ts`).
 * [noteRest] : la note sans cette adresse ; [iconInBadge] : la pastille d'origine montre déjà l'icône de ce site ;
 * [nameIsLink] : le nom n'est que l'adresse (la ligne affiche alors le titre de la page).
 */
data class TaskLink(
    val url: String,
    val host: String,
    val noteRest: String,
    val iconInBadge: Boolean,
    val nameIsLink: Boolean = false,
)

object TaskLinks {
    fun of(task: TaskItem): TaskLink? {
        val inNote = task.note?.let { LinkExtractor.urls(it, limit = 1).firstOrNull() }
        val url = inNote ?: LinkExtractor.urls(task.name, limit = 1).firstOrNull() ?: return null
        val host = LinkExtractor.domain(url) ?: return null
        val badgeHost = TaskSources.of(task)?.url?.let(LinkExtractor::domain)
        return TaskLink(
            url = url,
            host = host,
            noteRest = if (inNote != null) task.note.orEmpty().replaceFirst(url, "").trim() else "",
            iconInBadge = badgeHost == host,
            nameIsLink = inNote == null && task.name.trim() == url,
        )
    }

    /** Titre affiché sur une ligne : pour une adresse nue, le titre de la page, sinon l'hôte et le chemin. */
    fun titleOf(name: String, link: TaskLink?, previewTitle: String?): String {
        if (link?.nameIsLink != true) return name
        val title = previewTitle?.trim()?.takeIf { it.isNotEmpty() }
        if (title != null) return title
        return runCatching {
            val path = URI(link.url).rawPath?.trimEnd('/').orEmpty()
            link.host + path
        }.getOrDefault(name)
    }
}
