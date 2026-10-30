package ch.nicolab.cadence.tasks.search

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class RecentSearchesTest {
    @Test
    fun `the latest query comes first and a repeat moves up instead of duplicating`() {
        val once = RecentSearches.add(listOf("pain", "hermès"), "lait")
        assertEquals(listOf("lait", "pain", "hermès"), once)
        assertEquals(listOf("HERMÈS", "lait", "pain"), RecentSearches.add(once, "  HERMÈS "))
    }

    @Test
    fun `a one-letter or blank query is not remembered`() {
        val recents = listOf("pain")
        assertEquals(recents, RecentSearches.add(recents, "a"))
        assertEquals(recents, RecentSearches.add(recents, "   "))
    }

    @Test
    fun `the list is capped and an entry can be removed`() {
        val full = (1..12).fold(emptyList<String>()) { list, n -> RecentSearches.add(list, "requête $n") }
        assertEquals(RecentSearches.MAX, full.size)
        assertEquals("requête 12", full.first())
        assertEquals(RecentSearches.MAX - 1, RecentSearches.remove(full, "requête 12").size)
    }
}
