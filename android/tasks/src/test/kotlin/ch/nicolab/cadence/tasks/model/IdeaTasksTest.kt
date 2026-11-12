package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class IdeaTasksTest {
    /** Mêmes verbes que les chaînes de l'appli, dans leur forme `%1$s`. */
    private val verbs: TaskVerbs = { kind ->
        when (kind) {
            LinkKind.REPO, LinkKind.TOOL -> "Essayer : %1\$s"
            LinkKind.ARTICLE -> "Lire : %1\$s"
            LinkKind.VIDEO -> "Regarder : %1\$s"
            LinkKind.OTHER -> null
        }
    }
    private val noVerbs: TaskVerbs = { null }

    @Test
    fun `le nom vient du titre de la page s'il est connu`() {
        assertEquals("jqlang/jq", IdeaTasks.taskName("voir https://github.com/jqlang/jq pour les logs", " jq : JSON en ligne de commande ", noVerbs))
    }

    @Test
    fun `sans titre, le nom est le texte sans l'adresse, sinon le dépôt ou le domaine`() {
        assertEquals("voir pour les logs", IdeaTasks.taskName("voir https://example.com/jq pour les logs", null, noVerbs))
        assertEquals("pour les factures", IdeaTasks.taskName("https://a.io/x - pour les factures", "  ", noVerbs))
        assertEquals("jqlang/jq", IdeaTasks.taskName("https://www.github.com/jqlang/jq", null, noVerbs))
        assertEquals("a.io", IdeaTasks.taskName("https://www.a.io/x/y", null, noVerbs))
    }

    @Test
    fun `une idée sans adresse garde son texte et n'a pas de note`() {
        assertEquals("Appeler le garage", IdeaTasks.taskName("  Appeler le garage ", "ignoré", verbs))
        assertNull(IdeaTasks.taskNote("Appeler le garage"))
    }

    @Test
    fun `la note est l'adresse puis le reste du texte`() {
        assertEquals("https://github.com/jqlang/jq\n\nvoir pour les logs", IdeaTasks.taskNote("voir https://github.com/jqlang/jq pour les logs"))
        assertEquals("https://a.io/x", IdeaTasks.taskNote("https://a.io/x"))
    }

    @Test
    fun `un dépôt GitHub s'appelle Essayer, avec son titre ou son nom`() {
        assertEquals("Essayer : acme/rocket", IdeaTasks.taskName("https://github.com/acme/rocket", "GitHub - acme/rocket: fusée", verbs))
        assertEquals("Essayer : acme/rocket", IdeaTasks.taskName("https://github.com/acme/rocket", null, verbs))
        assertEquals("Essayer : acme/rocket", IdeaTasks.capturedName("https://github.com/acme/rocket", "  ", verbs))
        assertEquals("https://github.com/acme/rocket\n\npour tester", IdeaTasks.taskNote("https://github.com/acme/rocket pour tester"))
    }

    @Test
    fun `une vidéo avec des mots s'appelle Regarder, le texte sert de titre sans page connue`() {
        assertEquals("Regarder : pour la conf", IdeaTasks.taskName("https://youtu.be/abc pour la conf", null, verbs))
        assertEquals("Regarder : Une conférence", IdeaTasks.taskName("https://youtu.be/abc pour la conf", "Une conférence", verbs))
        assertEquals("https://youtu.be/abc\n\npour la conf", IdeaTasks.taskNote("https://youtu.be/abc pour la conf"))
    }

    @Test
    fun `un article s'appelle Lire, une autre page garde son titre seul`() {
        assertEquals("Lire : Un texte", IdeaTasks.taskName("https://medium.com/@a/b", "Un texte", verbs))
        assertEquals("Quelque chose", IdeaTasks.taskName("https://example.com/a/b", "Quelque chose", verbs))
    }

    @Test
    fun `sans titre ni mots, le nom retombe sur le domaine avec son verbe pour un article`() {
        assertEquals("medium.com", IdeaTasks.taskName("https://medium.com/@a/b", null, noVerbs))
        assertEquals("Lire : medium.com", IdeaTasks.taskName("https://medium.com/@a/b", null, verbs))
    }

    @Test
    fun `une idée n'est qu'une adresse si rien d'autre n'est écrit`() {
        assertTrue(IdeaTasks.isOnlyAddress("https://a.io/x"))
        assertFalse(IdeaTasks.isOnlyAddress("voir https://a.io/x"))
        assertFalse(IdeaTasks.isOnlyAddress("Appeler le garage"))
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
