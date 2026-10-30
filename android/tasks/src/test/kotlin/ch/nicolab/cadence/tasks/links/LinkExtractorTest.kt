package ch.nicolab.cadence.tasks.links

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LinkExtractorTest {
    @Test
    fun `les liens http et https sortent dans l'ordre sans doublon`() {
        val text = "Voir https://a.example/x puis http://b.example et encore https://a.example/x"
        assertEquals(listOf("https://a.example/x", "http://b.example"), LinkExtractor.urls(text))
    }

    @Test
    fun `la ponctuation finale n'appartient pas au lien`() {
        assertEquals(listOf("https://a.example/page"), LinkExtractor.urls("Lire https://a.example/page, merci."))
        assertEquals(listOf("https://a.example/p?q=1"), LinkExtractor.urls("(https://a.example/p?q=1)"))
        assertEquals(listOf("https://a.example/p"), LinkExtractor.urls("regarde https://a.example/p !"))
    }

    @Test
    fun `des parentheses equilibrees restent dans le lien`() {
        assertEquals(
            listOf("https://fr.wikipedia.org/wiki/Cadence_(musique)"),
            LinkExtractor.urls("https://fr.wikipedia.org/wiki/Cadence_(musique)."),
        )
    }

    @Test
    fun `la cible d'un lien markdown est extraite sans la parenthese fermante`() {
        assertEquals(listOf("https://a.example/doc"), LinkExtractor.urls("[la doc](https://a.example/doc)"))
    }

    @Test
    fun `les autres schemas et les hotes sans point sont ignores`() {
        assertEquals(emptyList<String>(), LinkExtractor.urls("ftp://a.example mailto:x@y.z http://localhost https://"))
    }

    @Test
    fun `la limite garde les premiers liens`() {
        assertEquals(listOf("https://a.io", "https://b.io"), LinkExtractor.urls("https://a.io https://b.io https://c.io", limit = 2))
    }

    @Test
    fun `chaque occurrence porte sa plage dans le texte source`() {
        val text = "ab https://a.example. cd"
        val match = LinkExtractor.matches(text).single()
        assertEquals("https://a.example", text.substring(match.range))
    }

    @Test
    fun `le domaine perd schema www et chemin`() {
        assertEquals("example.com", LinkExtractor.domain("https://www.example.com/a/b?x=1"))
        assertEquals("sub.example.com", LinkExtractor.domain("http://sub.example.com:8080/"))
        assertNull(LinkExtractor.domain("pas une url"))
    }

    @Test
    fun `isOnlyLink est vrai seulement pour un texte reduit a un lien`() {
        assertTrue(LinkExtractor.isOnlyLink("  https://a.example/x  "))
        assertFalse(LinkExtractor.isOnlyLink("Lire https://a.example/x"))
    }
}
