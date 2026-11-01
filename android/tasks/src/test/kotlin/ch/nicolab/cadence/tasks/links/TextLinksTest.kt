package ch.nicolab.cadence.tasks.links

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class TextLinksTest {
    private fun urls(text: String): List<String> = TextLinks.matches(text).map { it.url }

    @Test
    fun `les numeros suisses et francais deviennent des liens tel`() {
        assertEquals(listOf("tel:+41791234567"), urls("Appeler +41 79 123 45 67 demain"))
        assertEquals(listOf("tel:0791234567"), urls("Tél 079 123 45 67"))
        assertEquals(listOf("tel:0123456789"), urls("01 23 45 67 89"))
    }

    @Test
    fun `les dates et heures ne sont pas des numeros`() {
        assertEquals(emptyList<String>(), urls("Réunion le 2026-11-01 à 08:30, salle 12"))
        assertEquals(emptyList<String>(), urls("Budget 1234 CHF, 3 personnes"))
    }

    @Test
    fun `les adresses mail deviennent des liens mailto sans le point final`() {
        assertEquals(listOf("mailto:anna.b@exemple.ch"), urls("Écris à anna.b@exemple.ch."))
    }

    @Test
    fun `une url ne produit pas de lien parasite pour son mail ou son numero`() {
        assertEquals(
            listOf("https://exemple.ch/inscription?mail=anna@exemple.ch"),
            urls("Voir https://exemple.ch/inscription?mail=anna@exemple.ch"),
        )
    }

    @Test
    fun `les matches gardent leur position dans le texte`() {
        val match = TextLinks.matches("Tel +41 79 123 45 67").single()
        assertEquals(4 until 20, match.range)
    }
}
