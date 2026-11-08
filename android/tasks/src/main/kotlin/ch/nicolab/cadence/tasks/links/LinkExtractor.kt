package ch.nicolab.cadence.tasks.links

import java.net.URI

/** Un lien trouvé dans un texte : sa [range] dans la source et son [url] nettoyé. */
data class LinkMatch(val range: IntRange, val url: String)

/**
 * Repère les liens http(s) d'un texte libre (idée, note, nom ou note de tâche).
 * La ponctuation de fin de phrase et la parenthèse fermante d'un lien markdown n'en font pas partie.
 */
object LinkExtractor {
    private val candidate = Regex("""https?://[^\s<>"'`]+""", RegexOption.IGNORE_CASE)
    private const val TRAILING = ".,;:!?'\"»…*_"

    fun matches(text: String): List<LinkMatch> = candidate.findAll(text).mapNotNull { found ->
        val trimmed = trimEnd(found.value)
        val url = normalizeHostHyphens(trimmed)
        if (hasHost(url)) LinkMatch(found.range.first until found.range.first + trimmed.length, url) else null
    }.toList()

    fun urls(text: String, limit: Int = Int.MAX_VALUE): List<String> =
        matches(text).map { it.url }.distinct().take(limit)

    fun isOnlyLink(text: String): Boolean {
        val trimmed = text.trim().trimEnd(::isFormattingCharacter)
        val match = matches(trimmed).singleOrNull() ?: return false
        return match.range.first == 0 && match.range.last == trimmed.lastIndex
    }

    /** Nom d'hôte sans « www. », ou null si [url] n'est pas une adresse lisible. */
    fun domain(url: String): String? {
        val host = runCatching { URI(normalizeHostHyphens(url)).host }.getOrNull() ?: return null
        return host.removePrefix("www.").ifBlank { null }
    }

    private fun normalizeHostHyphens(url: String): String {
        val schemeEnd = url.indexOf("://")
        if (schemeEnd < 0) return url
        val start = schemeEnd + 3
        val end = url.indexOfAny(charArrayOf('/', '?', '#'), start).takeIf { it >= 0 } ?: url.length
        val authority = url.substring(start, end)
        val normalized = authority.map { char ->
            if (char in '\u2010'..'\u2015' || char in "\u2212\uFE58\uFE63\uFF0D") '-' else char
        }.joinToString("")
        return if (normalized == authority) url else url.replaceRange(start, end, normalized)
    }

    private fun trimEnd(raw: String): String {
        var end = raw
        while (end.isNotEmpty()) {
            val last = end.last()
            val drop = when {
                last in TRAILING || isFormattingCharacter(last) -> true
                last == ')' -> end.count { it == ')' } > end.count { it == '(' }
                last == ']' -> end.count { it == ']' } > end.count { it == '[' }
                else -> false
            }
            if (!drop) break
            end = end.dropLast(1)
        }
        return end
    }

    private fun isFormattingCharacter(char: Char): Boolean =
        Character.getType(char) == Character.FORMAT.toInt()

    private fun hasHost(url: String): Boolean = domain(url)?.contains('.') == true
}
