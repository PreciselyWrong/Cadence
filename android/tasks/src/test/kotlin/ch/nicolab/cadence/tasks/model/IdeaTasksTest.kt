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
    fun `une saisie qui n'est qu'une adresse, avec étiquettes et projet, est un lien seul`() {
        org.junit.jupiter.api.Assertions.assertEquals("https://exemple.org/page", IdeaTasks.linkOnly("https://exemple.org/page #lecture +Veille"))
        org.junit.jupiter.api.Assertions.assertEquals("https://exemple.org/page", IdeaTasks.linkOnly("  https://exemple.org/page  "))
        org.junit.jupiter.api.Assertions.assertNull(IdeaTasks.linkOnly("Lire https://exemple.org/page"))
        org.junit.jupiter.api.Assertions.assertNull(IdeaTasks.linkOnly("https://exemple.org/page\nautre"))
        org.junit.jupiter.api.Assertions.assertNull(IdeaTasks.linkOnly("pas de lien #x"))
    }

    @Test
    fun `deux écritures d'une même adresse ont la même clé`() {
        org.junit.jupiter.api.Assertions.assertEquals(LinkKeys.of("https://exemple.org/page"), LinkKeys.of("https://EXEMPLE.org/page/#titre"))
        org.junit.jupiter.api.Assertions.assertNotEquals(LinkKeys.of("https://exemple.org/page?a=1"), LinkKeys.of("https://exemple.org/page"))
    }
}
