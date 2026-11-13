package ch.nicolab.cadence.tasks.model

import ch.nicolab.cadence.tasks.links.LinkExtractor

/**
 * Badge d'origine d'une tâche : une lettre, un nom, la page à ouvrir s'il y en a une, et le chemin serveur de l'icône
 * de son site (`/api/links/favicon`, lu par le serveur ; web : `taskSource.ts`, `linksService.faviconUrl`).
 */
data class TaskSourceBadge(val letter: String, val label: String, val url: String?, val faviconPath: String? = null)

/** Origine d'une tâche (`docs/00-tasks-behavior.md`, « Origin badge »), sans Android. */
object TaskSources {
    private val badges = mapOf(
        "gmail" to ("M" to "Gmail"),
        "telegram" to ("T" to "Telegram"),
        "mcp" to ("C" to "MCP"),
        "android" to ("A" to "Android"),
        "desktop" to ("D" to "Desktop"),
        "link" to ("L" to "Lien"),
    )

    /**
     * Le badge de [task], ou null : une tâche web sans origine n'en a pas, une tâche d'un TODO.md garde son badge
     * « TODO.md ». Seule une adresse http ou https s'ouvre depuis le badge.
     */
    fun of(task: TaskItem): TaskSourceBadge? {
        if (task.fileBacked) return null
        val (letter, label) = badges[task.source] ?: return null
        val url = task.sourceUrl?.trim()?.takeIf(::isWeb)
        return TaskSourceBadge(letter, label, url, url?.let(::faviconPath))
    }

    /** Chemin serveur de l'icône du site de [url] (`/api/links/favicon?host=`), ou null sans hôte. */
    fun faviconPath(url: String): String? {
        val host = runCatching { java.net.URI(url).host }.getOrNull()?.lowercase()?.takeIf { it.isNotBlank() } ?: return null
        return "/api/links/favicon?host=" + java.net.URLEncoder.encode(host, Charsets.UTF_8)
    }

    /** Origine d'une tâche née d'une idée : une idée qui n'est qu'une adresse donne `link` et cette adresse. */
    fun fromIdea(text: String): Pair<String, String>? {
        val content = text.trim()
        if (content.isEmpty() || content.any { it.isWhitespace() } || !isWeb(content)) return null
        return "link" to content
    }

    private fun isWeb(url: String): Boolean =
        (url.startsWith("http://", ignoreCase = true) || url.startsWith("https://", ignoreCase = true)) &&
            LinkExtractor.matches(url).firstOrNull()?.range?.first == 0
}
