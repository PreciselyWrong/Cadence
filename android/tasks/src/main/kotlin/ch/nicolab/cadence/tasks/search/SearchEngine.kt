package ch.nicolab.cadence.tasks.search

import java.text.Normalizer

enum class SearchKind { TASK, PROJECT, NOTE, HABIT }

/** Filtre de la recherche : `ALL` ou un seul type de résultat. */
enum class SearchFilter(val kind: SearchKind?) {
    ALL(null),
    TASKS(SearchKind.TASK),
    NOTES(SearchKind.NOTE),
    PROJECTS(SearchKind.PROJECT),
    HABITS(SearchKind.HABIT),
}

/**
 * Une ligne cherchable. [detail] est un texte secondaire (contenu d'une note, projet d'une
 * tâche…) ; [closed] range une tâche terminée après les ouvertes.
 */
data class SearchEntry(
    val kind: SearchKind,
    val id: String,
    val title: String,
    val detail: String = "",
    val closed: Boolean = false,
)

data class SearchHit(val entry: SearchEntry, val score: Int)

/** Recherche locale insensible à la casse et aux accents ; tous les mots de la requête doivent correspondre. */
object SearchEngine {
    fun search(entries: List<SearchEntry>, query: String, filter: SearchFilter): List<SearchHit> {
        val words = normalize(query).split(' ').filter { it.isNotEmpty() }
        if (words.isEmpty()) return emptyList()
        val whole = words.joinToString(" ")
        return entries.asSequence()
            .filter { filter.kind == null || it.kind == filter.kind }
            .mapNotNull { entry -> score(entry, words, whole)?.let { SearchHit(entry, it) } }
            .sortedWith(compareByDescending<SearchHit> { it.score }.thenBy { it.entry.title.lowercase() })
            .toList()
    }

    /** Nombre de résultats par type, pour les pastilles de filtre. */
    fun counts(hits: List<SearchHit>): Map<SearchKind, Int> = hits.groupingBy { it.entry.kind }.eachCount()

    private fun score(entry: SearchEntry, words: List<String>, whole: String): Int? {
        val title = normalize(entry.title)
        val detail = normalize(entry.detail)
        var total = 0
        for (word in words) {
            val inTitle = wordScore(title, word)
            val inDetail = if (detail.contains(word)) DETAIL else 0
            val best = maxOf(inTitle, inDetail)
            if (best == 0) return null
            total += best
        }
        if (title == whole) total += EXACT
        if (entry.closed) total -= CLOSED_PENALTY
        return total
    }

    private fun wordScore(title: String, word: String): Int = when {
        title.startsWith(word) -> TITLE_PREFIX
        title.split(' ').any { it.startsWith(word) } -> TITLE_WORD
        title.contains(word) -> TITLE_SUBSTRING
        else -> 0
    }

    private fun normalize(text: String): String =
        Normalizer.normalize(text.lowercase(), Normalizer.Form.NFD)
            .replace(DIACRITICS, "")
            .trim()

    private val DIACRITICS = Regex("\\p{Mn}+")
    private const val TITLE_PREFIX = 100
    private const val TITLE_WORD = 80
    private const val TITLE_SUBSTRING = 60
    private const val DETAIL = 20
    private const val EXACT = 200
    private const val CLOSED_PENALTY = 5
}
