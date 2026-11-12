package ch.nicolab.cadence.tasks.model

import ch.nicolab.cadence.tasks.links.LinkExtractor

/** Badge d'origine d'une tâche : une lettre, un nom, et la page à ouvrir s'il y en a une (web : `taskSource.ts`). */
data class TaskSourceBadge(val letter: String, val label: String, val url: String?)

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
        return TaskSourceBadge(letter, label, task.sourceUrl?.trim()?.takeIf(::isWeb))
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
