package ch.nicolab.cadence.tasks.search

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SearchHighlightTest {
    private fun marked(text: String, ranges: List<IntRange>) = ranges.map { text.substring(it.first, it.last + 1) }

    @Test
    fun `matches ignore case and accents and point at the original text`() {
        val text = "Agent Hermès paperless"
        assertEquals(listOf("Hermès"), marked(text, SearchHighlight.ranges(text, "hermes")))
        assertEquals(listOf("Hermès"), marked(text, SearchHighlight.ranges(text, "HERMÈS")))
    }

    @Test
    fun `every word of the query is marked and overlapping marks merge`() {
        val text = "N8N et Hermès"
        assertEquals(listOf("N8N", "Hermès"), marked(text, SearchHighlight.ranges(text, "hermes n8n")))
        assertEquals(listOf("Hermès"), marked(text, SearchHighlight.ranges(text, "herm hermes")))
    }

    @Test
    fun `no match and blank query give no range`() {
        assertTrue(SearchHighlight.ranges("Acheter du pain", "lait").isEmpty())
        assertTrue(SearchHighlight.ranges("Acheter du pain", "  ").isEmpty())
    }

    @Test
    fun `a snippet is one line around the first match with ellipses`() {
        val detail = "Premier paragraphe sans rapport.\n\nLe rendez-vous avec Hermès est confirmé pour jeudi prochain à la boulangerie."
        val snippet = SearchHighlight.snippet(detail, "hermes", maxChars = 40)!!
        assertFalse(snippet.text.contains('\n'))
        assertTrue(snippet.text.startsWith("…"))
        assertTrue(snippet.text.endsWith("…"))
        assertTrue(snippet.text.length <= 42)
        assertEquals(listOf("Hermès"), marked(snippet.text, snippet.ranges))
    }

    @Test
    fun `a short detail that matches is kept whole without ellipsis`() {
        val snippet = SearchHighlight.snippet("boulangerie hermes", "hermes", maxChars = 60)!!
        assertEquals("boulangerie hermes", snippet.text)
        assertEquals(listOf("hermes"), marked(snippet.text, snippet.ranges))
    }

    @Test
    fun `no snippet when the detail does not hold the query`() {
        assertNull(SearchHighlight.snippet("rien à voir", "hermes", maxChars = 60))
        assertNull(SearchHighlight.snippet("", "hermes", maxChars = 60))
    }
}
