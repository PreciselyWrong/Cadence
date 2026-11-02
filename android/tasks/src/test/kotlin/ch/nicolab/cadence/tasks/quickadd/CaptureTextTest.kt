package ch.nicolab.cadence.tasks.quickadd

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class CaptureTextTest {
    @Test
    fun `un retour a la ligne colle devient une espace de meme longueur`() {
        assertEquals("Appeler Paul  demain", singleLineCapture("Appeler Paul\r\ndemain"))
        assertEquals("Appeler Paul demain".length, singleLineCapture("Appeler Paul\ndemain").length)
    }

    @Test
    fun `un texte sans saut de ligne reste identique`() {
        assertEquals("Acheter du pain !1", singleLineCapture("Acheter du pain !1"))
    }
}
