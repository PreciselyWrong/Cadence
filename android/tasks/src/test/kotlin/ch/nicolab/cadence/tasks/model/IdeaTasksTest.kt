package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class IdeaTasksTest {
    @Test
    fun `le nom vient du titre de la page s'il est connu`() {
        assertEquals("jq : JSON en ligne de commande", IdeaTasks.taskName("voir https://github.com/jqlang/jq pour les logs", " jq : JSON en ligne de commande "))
    }

    @Test
    fun `sans titre, le nom est le texte sans l'adresse, sinon le domaine`() {
        assertEquals("voir pour les logs", IdeaTasks.taskName("voir https://github.com/jqlang/jq pour les logs", null))
        assertEquals("pour les factures", IdeaTasks.taskName("https://a.io/x - pour les factures", "  "))
        assertEquals("github.com", IdeaTasks.taskName("https://www.github.com/jqlang/jq", null))
    }

    @Test
    fun `une idée sans adresse garde son texte et n'a pas de note`() {
        assertEquals("Appeler le garage", IdeaTasks.taskName("  Appeler le garage ", "ignoré"))
        assertNull(IdeaTasks.taskNote("Appeler le garage"))
    }

    @Test
    fun `la note est l'adresse puis le reste du texte`() {
        assertEquals("https://github.com/jqlang/jq\n\nvoir pour les logs", IdeaTasks.taskNote("voir https://github.com/jqlang/jq pour les logs"))
        assertEquals("https://a.io/x", IdeaTasks.taskNote("https://a.io/x"))
    }

    @Test
    fun `une idée avec adresse donne un lien avec titre, reste du texte en note et idée en source`() {
        val draft = IdeaTasks.linkDraft("https://a.io/x - pour les factures", "A", listOf("dev", "dev", "outils"), "p1", sourceUid = "e1")
        assertEquals(
            LinkDraft("https://a.io/x", "A", "pour les factures", listOf("dev", "outils"), "p1", "inbox_item", "e1"),
            draft,
        )
        assertEquals("link-add:inbox_item:e1:https://a.io/x", draft?.callKey)
    }

    @Test
    fun `un partage direct n'a pas de source, et un texte sans adresse pas de lien`() {
        val draft = IdeaTasks.linkDraft("https://a.io/x", null, emptyList(), null)
        assertEquals(LinkDraft("https://a.io/x"), draft)
        assertEquals("link-add:https://a.io/x", draft?.callKey)
        assertNull(IdeaTasks.linkDraft("rien à garder", "Titre", emptyList(), null))
    }

    @Test
    fun `les étiquettes partent par leur nom, dans l'ordre du choix`() {
        val tags = listOf(TagItem("t1", "dev"), TagItem("t2", "perso/sport"))
        assertEquals(listOf("perso/sport", "dev"), IdeaTasks.tagNames(listOf("t2", "ghost", "t1"), tags))
    }
}
