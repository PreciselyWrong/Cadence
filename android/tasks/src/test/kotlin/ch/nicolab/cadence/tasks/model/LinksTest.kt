package ch.nicolab.cadence.tasks.model

import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LinksTest {
    private val repo = LinkItem(
        uid = "repo", url = "https://github.com/a/b", title = "a/b", kind = LinkKind.REPO,
        readmeExcerpt = "Fast JSON CLI", tagUids = listOf("t1"), createdAt = Instant.parse("2026-10-03T00:00:00Z"),
    )
    private val post = LinkItem(
        uid = "post", url = "https://blog.example.com/p", kind = LinkKind.ARTICLE, note = "Idée pour le café",
        status = LinkStatus.KEPT, createdAt = Instant.parse("2026-10-02T00:00:00Z"),
    )
    private val gone = LinkItem(
        uid = "gone", url = "https://github.com/c/d", status = LinkStatus.DROPPED,
        createdAt = Instant.parse("2026-10-01T00:00:00Z"),
    )
    private val links = listOf(gone, post, repo)

    private fun uids(filter: LinkFilter) = LinkLists.filter(links, filter, mapOf("t1" to "dev")).map { it.uid }

    @Test
    fun `par défaut les liens jetés sont cachés, les plus récents d'abord`() {
        assertEquals(listOf("repo", "post"), uids(LinkFilter()))
    }

    @Test
    fun `la recherche lit titre, note, README et étiquettes sans accents ni casse`() {
        assertEquals(listOf("repo"), uids(LinkFilter(query = "json cli")))
        assertEquals(listOf("post"), uids(LinkFilter(query = "IDEE cafe")))
        assertEquals(listOf("repo"), uids(LinkFilter(query = "dev")))
    }

    @Test
    fun `filtre par type, statut et site`() {
        assertEquals(listOf("post"), uids(LinkFilter(kind = LinkKind.ARTICLE)))
        assertEquals(listOf("gone"), uids(LinkFilter(status = LinkStatus.DROPPED)))
        assertEquals(listOf("repo"), uids(LinkFilter(domain = "github.com")))
        assertEquals(listOf("github.com", "blog.example.com"), LinkLists.domains(links))
    }

    @Test
    fun `le filtre par statut ne garde que ce statut, gardés, à tester ou plus tard`() {
        val tested = LinkItem(uid = "try", url = "https://b.io/y", status = LinkStatus.TESTED, createdAt = Instant.parse("2026-10-05T00:00:00Z"))
        val parked = LinkItem(uid = "later", url = "https://a.io/x", status = LinkStatus.PARKED, createdAt = Instant.parse("2026-10-04T00:00:00Z"))
        val pool = listOf(parked, tested, post)

        assertEquals(listOf("try"), LinkLists.filter(pool, LinkFilter(status = LinkStatus.TESTED)).map { it.uid })
        assertEquals(listOf("later"), LinkLists.filter(pool, LinkFilter(status = LinkStatus.PARKED)).map { it.uid })
        assertEquals(listOf("post"), LinkLists.filter(pool, LinkFilter(status = LinkStatus.KEPT)).map { it.uid })
    }

    @Test
    fun `le filtre par étiquette garde les liens qui la portent`() {
        assertEquals(listOf("repo"), uids(LinkFilter(tagUid = "t1")))
        assertEquals(emptyList<String>(), uids(LinkFilter(tagUid = "t2")))
    }

    @Test
    fun `une idée retrouve son lien, sinon la même page`() {
        val own = LinkItem(uid = "own", url = "https://a.io/x", sourceType = "inbox_item", sourceUid = "i1")
        assertEquals("own", LinkLists.forEntry(listOf(own), "i1", "https://a.io/x")?.uid)
        assertEquals("own", LinkLists.forEntry(listOf(own), "i2", "voir https://A.io/x/")?.uid)
        assertNull(LinkLists.forEntry(listOf(own), "i3", "pas de lien"))
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
    fun `statut et type inconnus retombent sur les valeurs neutres`() {
        assertEquals(LinkStatus.NEW, LinkStatus.fromWire("archived"))
        assertEquals(LinkKind.OTHER, LinkKind.fromWire(null))
        assertEquals("a.io", LinkItem(uid = "x", url = "https://www.a.io/").displayTitle)
    }

    @Test
    fun `le lien garde sa source, la note, la fiche ou l'idée d'origine`() {
        assertEquals(LinkSource(LinkSourceKind.NOTE, "n1"), post.copy(sourceType = "note", sourceUid = "n1").source)
        assertEquals(LinkSource(LinkSourceKind.TASK, "t9"), post.copy(sourceType = "task", sourceUid = "t9").source)
        assertEquals(LinkSource(LinkSourceKind.INBOX_ITEM, "i1"), post.copy(sourceType = "inbox_item", sourceUid = "i1").source)
        assertNull(post.copy(sourceType = "task", sourceUid = null).source)
        assertNull(post.copy(sourceType = "archive", sourceUid = "x").source)
        assertNull(post.source)
    }
}
