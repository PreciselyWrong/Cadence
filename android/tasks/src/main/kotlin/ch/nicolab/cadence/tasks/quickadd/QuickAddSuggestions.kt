package ch.nicolab.cadence.tasks.quickadd

import java.text.Normalizer

/** Ce que le mot sous le curseur est en train de désigner. */
enum class SuggestionKind { TAG, PROJECT, PRIORITY }

/**
 * Le jeton `#`, `+` ou `!` en cours de frappe : [start] est la position du signe, [end] la fin du mot (le
 * curseur peut être au milieu), [query] ce qui est tapé après le signe, sans guillemet ouvrant.
 */
data class TokenAtCursor(val kind: SuggestionKind, val start: Int, val end: Int, val query: String)

/** Texte après l'insertion d'un jeton, et où poser le curseur. */
data class TokenEdit(val text: String, val cursor: Int)

/**
 * Suggestions en direct de la saisie rapide. Mêmes jetons que [QuickAddParser] et que la capture web
 * (`frontend/utils/slashMenu.ts`) : `#étiquette` (chemin `perso/sport`), `+projet` ou `^projet`, `!1`-`!3`.
 * Un jeton ne s'ouvre qu'en début de mot, pour laisser « C# », « super! » et les adresses tranquilles.
 * Tout se calcule sur les données locales, sans réseau.
 */
object QuickAddSuggestions {
    private const val MAX_SUGGESTIONS = 8
    private const val WORD = "[\\p{L}\\p{N}_/-]*"

    private val quoted = Regex("(?:^|\\s)([#+^])\"([^\"]*)$")
    private val bare = Regex("(?:^|\\s)([#+^!])($WORD)$")
    private val wordChars = Regex("[\\p{L}\\p{N}_/-]+")

    /** Le jeton dont le curseur touche la fin de la frappe, ou null quand rien n'est à proposer. */
    fun tokenAt(text: String, cursor: Int): TokenAtCursor? {
        if (cursor < 0 || cursor > text.length) return null
        val before = text.substring(0, cursor)
        quoted.find(before)?.let { match ->
            val sign = match.groups[1]!!
            val closing = text.indexOf('"', cursor)
            val end = if (closing >= 0) closing + 1 else cursor
            return TokenAtCursor(kindOf(sign.value[0]), sign.range.first, end, match.groupValues[2])
        }
        val match = bare.find(before) ?: return null
        val sign = match.groupValues[1][0]
        val query = match.groupValues[2]
        // Un jeton `!` n'a pas d'autre suite que le chiffre ; une fois complet il n'y a plus rien à choisir.
        if (sign == '!' && query.isNotEmpty()) return null
        val start = cursor - query.length - 1
        var end = cursor
        while (end < text.length && !text[end].isWhitespace()) end++
        return TokenAtCursor(kindOf(sign), start, end, query)
    }

    private fun kindOf(sign: Char) = when (sign) {
        '#' -> SuggestionKind.TAG
        '!' -> SuggestionKind.PRIORITY
        else -> SuggestionKind.PROJECT
    }

    /** Remplace le jeton par [token] suivi d'un espace (sans le doubler) et place le curseur après. */
    fun insert(text: String, at: TokenAtCursor, token: String): TokenEdit {
        val head = text.substring(0, at.start) + token
        val tail = text.substring(at.end)
        val spaced = if (tail.startsWith(" ")) tail.substring(1) else tail
        return TokenEdit(head + " " + spaced, head.length + 1)
    }

    /** `#perso/sport`, ou `#"nom avec espace"` quand le nom n'est pas un mot. */
    fun tagToken(name: String): String = "#" + wordOrQuoted(name)

    fun projectToken(name: String): String = "+" + wordOrQuoted(name)

    /** `!1` est la priorité haute, `!3` la basse, comme sur le web. */
    fun priorityToken(digit: Int): String = "!$digit"

    private fun wordOrQuoted(name: String) = if (wordChars.matches(name)) name else "\"$name\""

    /**
     * Les éléments dont le nom correspond à [query] (accents et casse ignorés) : ceux qui commencent par la
     * requête, puis ceux dont un mot ou segment de chemin commence ainsi, puis le reste ; à rang égal le
     * plus utilisé d'abord, puis l'ordre alphabétique.
     */
    fun <T> rank(items: List<T>, query: String, name: (T) -> String, usage: (T) -> Int = { 0 }): List<T> {
        val wanted = fold(query.trim())
        return items
            .filter { fold(name(it)).contains(wanted) }
            .sortedWith(
                compareBy<T> { rankOf(fold(name(it)), wanted) }
                    .thenByDescending { usage(it) }
                    .thenBy { fold(name(it)) },
            )
            .take(MAX_SUGGESTIONS)
    }

    private fun rankOf(name: String, wanted: String): Int = when {
        wanted.isEmpty() || name.startsWith(wanted) -> 0
        name.split(Regex("[\\s/_-]+")).any { it.startsWith(wanted) } -> 1
        else -> 2
    }

    private fun fold(value: String): String =
        Normalizer.normalize(value, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase()
}
