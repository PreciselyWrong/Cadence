package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LinksTest {
    @Test
    fun `une idée retrouve la page qui porte la même adresse, sans casse ni barre finale`() {
        val page = LinkItem(uid = "page", url = "https://a.io/x", projectUid = "p1")
        assertEquals("page", LinkLists.forEntry(listOf(page), "https://a.io/x")?.uid)
        assertEquals("page", LinkLists.forEntry(listOf(page), "voir https://A.io/x/")?.uid)
        assertNull(LinkLists.forEntry(listOf(page), "pas de lien"))
        assertNull(LinkLists.forEntry(listOf(page), "https://a.io/autre"))
    }

    @Test
    fun `le texte de l'idée n'est pas répété quand il est devenu la note`() {
        val link = LinkItem(uid = "l", url = "https://a.io/x", note = "pour les factures")
        assertEquals("pour les factures", LinkLists.textAround("https://a.io/x - pour les factures", "https://a.io/x"))
        assertFalse(LinkLists.showsText("https://a.io/x - pour les factures", link))
        assertTrue(LinkLists.showsText("https://a.io/x autre chose", link))
        assertFalse(LinkLists.showsText("https://a.io/x", link))
        assertFalse(LinkLists.showsText("https://a.io/x", null))
        assertTrue(LinkLists.showsText("une idée sans lien", null))
    }

    @Test
    fun `type inconnu retombe sur autre, et le titre sur le site`() {
        assertEquals(LinkKind.OTHER, LinkKind.fromWire(null))
        assertEquals(LinkKind.OTHER, LinkKind.fromWire("archive"))
        assertEquals("a.io", LinkItem(uid = "x", url = "https://www.a.io/").displayTitle)
    }
}
