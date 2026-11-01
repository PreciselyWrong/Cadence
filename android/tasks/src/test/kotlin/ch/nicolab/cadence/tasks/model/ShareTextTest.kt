package ch.nicolab.cadence.tasks.model

import org.junit.Assert.assertEquals
import org.junit.Test

class ShareTextTest {
    @Test
    fun `une tâche partagée donne son nom, puis sa note après une ligne vide`() {
        assertEquals("Acheter du pain\n\nla boulangerie ferme à 19 h", ShareText.withNote("  Acheter du pain ", "  la boulangerie ferme à 19 h\n"))
    }

    @Test
    fun `sans note, seul le titre part, pas de lignes vides en trop`() {
        assertEquals("Acheter du pain", ShareText.withNote("Acheter du pain", null))
        assertEquals("Acheter du pain", ShareText.withNote("Acheter du pain", "   "))
    }

    @Test
    fun `un lien part avec son titre et son adresse, ou seulement l'adresse sans titre`() {
        assertEquals("Doc Kotlin\nhttps://kotlinlang.org", ShareText.link("Doc Kotlin", "https://kotlinlang.org"))
        assertEquals("https://kotlinlang.org", ShareText.link(" ", "https://kotlinlang.org"))
    }
}
