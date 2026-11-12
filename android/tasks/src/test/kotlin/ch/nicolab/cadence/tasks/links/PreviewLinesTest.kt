package ch.nicolab.cadence.tasks.links

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class PreviewLinesTest {
    @Test
    fun `moins de mille etoiles s'ecrivent telles quelles`() {
        assertEquals("999", PreviewLines.compactStars(999))
    }

    @Test
    fun `mille et plus se lisent en milliers avec une decimale, sans ,0`() {
        assertEquals("1 k", PreviewLines.compactStars(1000))
        assertEquals("1,2 k", PreviewLines.compactStars(1234))
        assertEquals("1,3 k", PreviewLines.compactStars(1250))
        assertEquals("2 k", PreviewLines.compactStars(1999))
        assertEquals("10 k", PreviewLines.compactStars(9960))
    }

    @Test
    fun `la ligne d'un depot suit la forme etoiles, langage, date`() {
        assertEquals(
            "★ 1,2 k · Rust · 2026-11-01",
            PreviewLines.statsLine("repo", 1234, "Rust", "2026-11-01T10:00:00Z"),
        )
    }

    @Test
    fun `un langage ou une date absents sont omis sans laisser de separateur`() {
        assertEquals("★ 42", PreviewLines.statsLine("repo", 42, null, null))
        assertEquals("★ 42 · 2026-11-01", PreviewLines.statsLine("repo", 42, " ", "2026-11-01T10:00:00Z"))
    }

    @Test
    fun `pas de ligne pour un article, ou un depot sans etoiles connues`() {
        assertNull(PreviewLines.statsLine("article", 42, "Rust", "2026-11-01T10:00:00Z"))
        assertNull(PreviewLines.statsLine("repo", null, "Rust", "2026-11-01T10:00:00Z"))
    }
}
