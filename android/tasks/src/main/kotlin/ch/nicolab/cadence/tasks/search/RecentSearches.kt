package ch.nicolab.cadence.tasks.search

import android.content.Context

/** Liste des dernières recherches : la plus récente d'abord, sans doublon, bornée. */
object RecentSearches {
    const val MAX = 8
    private const val MIN_LENGTH = 2

    fun add(recents: List<String>, query: String): List<String> {
        val clean = query.trim().replace(Regex("\\s+"), " ")
        if (clean.length < MIN_LENGTH) return recents
        return (listOf(clean) + recents.filterNot { it.equals(clean, ignoreCase = true) }).take(MAX)
    }

    fun remove(recents: List<String>, query: String): List<String> = recents.filterNot { it == query }
}

/** Mémoire locale des recherches récentes : un fichier de préférences, jamais envoyé au serveur. */
class RecentSearchStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences("cadence_search", Context.MODE_PRIVATE)

    fun load(): List<String> =
        preferences.getString(KEY, null)?.split(SEPARATOR)?.filter { it.isNotBlank() }.orEmpty()

    fun save(recents: List<String>) {
        preferences.edit().putString(KEY, recents.joinToString(SEPARATOR)).apply()
    }

    private companion object {
        const val KEY = "recent_queries"
        const val SEPARATOR = "\n"
    }
}
