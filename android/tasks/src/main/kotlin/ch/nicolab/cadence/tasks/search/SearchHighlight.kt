package ch.nicolab.cadence.tasks.search

import java.text.Normalizer

/** Une ligne de contexte et les plages à mettre en évidence dedans. */
data class Snippet(val text: String, val ranges: List<IntRange>)

/**
 * Mise en évidence des mots cherchés. Même règle que [SearchEngine] - sans casse ni accents -
 * mais les plages visent le texte d'origine, accents compris.
 */
object SearchHighlight {
    private const val ELLIPSIS = "…"
    private const val LEAD_CHARS = 14
    private val DIACRITICS = Regex("\\p{Mn}+")
    private val WHITESPACE = Regex("\\s+")

    /** Plages du texte qui correspondent à un mot de [query], fusionnées et triées. */
    fun ranges(text: String, query: String): List<IntRange> {
        val words = query.trim().split(WHITESPACE).map(::fold).filter { it.isNotEmpty() }
        if (words.isEmpty() || text.isEmpty()) return emptyList()
        val folded = StringBuilder()
        val origin = ArrayList<Int>(text.length)
        text.forEachIndexed { index, char ->
            val piece = fold(char.toString())
            folded.append(piece)
            repeat(piece.length) { origin.add(index) }
        }
        val found = words.flatMap { word ->
            generateSequence(folded.indexOf(word).takeIf { it >= 0 }) { previous ->
                folded.indexOf(word, previous + 1).takeIf { it >= 0 }
            }.map { start -> origin[start]..origin[start + word.length - 1] }.toList()
        }
        return merge(found.sortedBy { it.first })
    }

    /**
     * Une seule ligne autour du premier mot trouvé dans [detail], d'au plus [maxChars] caractères
     * hors points de suspension. Renvoie null quand [detail] ne contient pas la recherche : le titre
     * porte déjà la correspondance, un contexte sans mot cherché n'apprendrait rien.
     */
    fun snippet(detail: String, query: String, maxChars: Int): Snippet? {
        val flat = detail.replace(WHITESPACE, " ").trim()
        val first = ranges(flat, query).firstOrNull() ?: return null
        val start = if (flat.length <= maxChars) 0 else (first.first - LEAD_CHARS).coerceIn(0, flat.length - maxChars)
        val end = minOf(flat.length, start + maxChars)
        val prefix = if (start > 0) ELLIPSIS else ""
        val suffix = if (end < flat.length) ELLIPSIS else ""
        val text = prefix + flat.substring(start, end) + suffix
        val shift = prefix.length - start
        val visible = ranges(flat, query).mapNotNull { range ->
            val from = maxOf(range.first, start)
            val to = minOf(range.last, end - 1)
            if (from <= to) (from + shift)..(to + shift) else null
        }
        return Snippet(text, visible)
    }

    private fun merge(sorted: List<IntRange>): List<IntRange> {
        val merged = ArrayList<IntRange>()
        for (range in sorted) {
            val last = merged.lastOrNull()
            if (last != null && range.first <= last.last + 1) {
                merged[merged.lastIndex] = last.first..maxOf(last.last, range.last)
            } else {
                merged.add(range)
            }
        }
        return merged
    }

    private fun fold(text: String): String =
        Normalizer.normalize(text.lowercase(), Normalizer.Form.NFD).replace(DIACRITICS, "")
}
