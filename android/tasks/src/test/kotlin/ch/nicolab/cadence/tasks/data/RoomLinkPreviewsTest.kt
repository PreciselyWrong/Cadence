package ch.nicolab.cadence.tasks.data

import ch.nicolab.cadence.tasks.links.CachedPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class RoomLinkPreviewsTest {
    private val url = "https://github.com/nicolas/cadence"
    private val now = 1_000_000_000_000L

    @Test
    fun `les champs GitHub de la reponse serveur sont gardes puis relus`() = runBlocking {
        val dao = FakeLinkPreviewDao()
        val answer = JsonObject(
            mapOf(
                "title" to JsonPrimitive("cadence"),
                "site_name" to JsonPrimitive("GitHub"),
                "kind" to JsonPrimitive("repo"),
                "github_stars" to JsonPrimitive(1234),
                "github_language" to JsonPrimitive("Rust"),
                "github_last_commit" to JsonPrimitive("2026-11-01T10:00:00Z"),
            ),
        )
        val previews = RoomLinkPreviews(dao, fetch = { answer }, nowMs = { now })

        previews.ensure(url)
        val read = previews.observe(url).first()!!

        assertEquals("GitHub", read.siteName)
        assertEquals("repo", read.kind)
        assertEquals(1234, read.githubStars)
        assertEquals("Rust", read.githubLanguage)
        assertEquals("2026-11-01T10:00:00Z", read.githubLastCommit)
        assertFalse(read.failed)
    }

    @Test
    fun `une reponse en erreur est gardee comme echec, sans contenu`() = runBlocking {
        val dao = FakeLinkPreviewDao()
        val answer = JsonObject(mapOf("error" to JsonPrimitive("unreadable")))
        val previews = RoomLinkPreviews(dao, fetch = { answer }, nowMs = { now })

        previews.ensure(url)
        val read = previews.observe(url).first()!!

        assertTrue(read.failed)
        assertNull(read.title)
        assertNull(read.githubStars)
    }
}

/** Table d'aperçus en mémoire : même contrat que [LinkPreviewDao], sans Room. */
private class FakeLinkPreviewDao : LinkPreviewDao {
    private val rows = MutableStateFlow<Map<String, LinkPreviewEntity>>(emptyMap())

    override fun observe(url: String): Flow<LinkPreviewEntity?> = rows.map { it[url] }

    override suspend fun get(url: String): LinkPreviewEntity? = rows.value[url]

    override suspend fun upsert(preview: LinkPreviewEntity) {
        rows.value = rows.value + (preview.url to preview)
    }

    override suspend fun deleteOlderThan(olderThanMs: Long) {
        rows.value = rows.value.filterValues { it.fetchedAtMs >= olderThanMs }
    }
}
