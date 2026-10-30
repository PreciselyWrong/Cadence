package ch.nicolab.cadence.tasks.search

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SearchEngineTest {
    private fun entry(kind: SearchKind, id: String, title: String, detail: String = "", closed: Boolean = false) =
        SearchEntry(kind, id, title, detail, closed)

    private val entries = listOf(
        entry(SearchKind.TASK, "t1", "Agent Hermès paperless"),
        entry(SearchKind.TASK, "t2", "N8N et Hermès"),
        entry(SearchKind.TASK, "t3", "Acheter du pain", detail = "boulangerie hermes"),
        entry(SearchKind.PROJECT, "p1", "Hermès"),
        entry(SearchKind.NOTE, "n1", "Architecture Hermès", detail = "flux paperless"),
        entry(SearchKind.HABIT, "h1", "Marche"),
    )

    @Test
    fun `blank query returns nothing`() {
        assertTrue(SearchEngine.search(entries, "  ", SearchFilter.ALL).isEmpty())
    }

    @Test
    fun `matching ignores case and accents`() {
        val hits = SearchEngine.search(entries, "HERMES", SearchFilter.ALL).map { it.entry.id }
        assertTrue(hits.containsAll(listOf("t1", "t2", "p1", "n1", "t3")))
    }

    @Test
    fun `title matches rank before detail matches and prefix before substring`() {
        val ranked = SearchEngine.search(entries, "hermes", SearchFilter.TASKS).map { it.entry.id }
        assertEquals(listOf("t1", "t2", "t3"), ranked.take(3))
        val prefix = SearchEngine.search(entries, "arch", SearchFilter.ALL).first()
        assertEquals("n1", prefix.entry.id)
    }

    @Test
    fun `exact title ranks first`() {
        val ranked = SearchEngine.search(entries, "hermès", SearchFilter.ALL)
        assertEquals("p1", ranked.first().entry.id)
    }

    @Test
    fun `closed tasks rank after open ones with equal relevance`() {
        val list = listOf(
            entry(SearchKind.TASK, "done", "Lire", closed = true),
            entry(SearchKind.TASK, "open", "Lire"),
        )
        assertEquals(listOf("open", "done"), SearchEngine.search(list, "lire", SearchFilter.ALL).map { it.entry.id })
    }

    @Test
    fun `filter keeps only its kind`() {
        assertEquals(
            listOf(SearchKind.PROJECT),
            SearchEngine.search(entries, "hermes", SearchFilter.PROJECTS).map { it.entry.kind }.distinct(),
        )
        assertEquals(listOf("h1"), SearchEngine.search(entries, "marche", SearchFilter.HABITS).map { it.entry.id })
        assertTrue(SearchEngine.search(entries, "marche", SearchFilter.NOTES).isEmpty())
    }

    @Test
    fun `every query word must match`() {
        val ids = SearchEngine.search(entries, "hermes paperless", SearchFilter.ALL).map { it.entry.id }
        assertTrue("t1" in ids && "n1" in ids)
        assertTrue("t2" !in ids)
    }

    @Test
    fun `counts per kind come from the given hits`() {
        val counts = SearchEngine.counts(SearchEngine.search(entries, "hermes", SearchFilter.ALL))
        assertEquals(3, counts[SearchKind.TASK])
        assertEquals(1, counts[SearchKind.PROJECT])
        assertEquals(1, counts[SearchKind.NOTE])
        assertEquals(null, counts[SearchKind.HABIT])
    }
}
