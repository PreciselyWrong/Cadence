package ch.nicolab.cadence.tasks.links

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PreviewCachePolicyTest {
    private val now = 1_000_000_000_000L
    private val ok = CachedPreview("https://a.example", "Titre", "Desc", "https://a.example/i.png", fetchedAtMs = now, failed = false)

    @Test
    fun `une entree absente doit etre chargee`() = assertTrue(PreviewCachePolicy.needsFetch(null, now))

    @Test
    fun `un succes reste frais sept jours`() {
        assertFalse(PreviewCachePolicy.needsFetch(ok, now + PreviewCachePolicy.SUCCESS_TTL_MS - 1))
        assertTrue(PreviewCachePolicy.needsFetch(ok, now + PreviewCachePolicy.SUCCESS_TTL_MS))
    }

    @Test
    fun `un echec est retente apres une heure`() {
        val failed = ok.copy(title = null, imageUrl = null, failed = true)
        assertFalse(PreviewCachePolicy.needsFetch(failed, now + PreviewCachePolicy.FAILURE_TTL_MS - 1))
        assertTrue(PreviewCachePolicy.needsFetch(failed, now + PreviewCachePolicy.FAILURE_TTL_MS))
    }

    @Test
    fun `un rafraichissement rate garde le contenu perime et repousse la prochaine tentative`() {
        val later = now + PreviewCachePolicy.SUCCESS_TTL_MS + 5
        val kept = PreviewCachePolicy.afterFailedRefresh(ok, later)
        assertEquals("Titre", kept.title)
        assertFalse(kept.failed)
        assertFalse(PreviewCachePolicy.needsFetch(kept, later + PreviewCachePolicy.FAILURE_TTL_MS - 1))
        assertTrue(PreviewCachePolicy.needsFetch(kept, later + PreviewCachePolicy.FAILURE_TTL_MS))
    }

    @Test
    fun `sans contenu precedent un echec devient une entree negative`() {
        val entry = PreviewCachePolicy.afterFailedRefresh(null, now, url = "https://a.example")
        assertTrue(entry.failed)
        assertEquals("https://a.example", entry.url)
    }

    @Test
    fun `une reponse serveur nettoie ses champs et passe l'image en https`() {
        val entry = PreviewCachePolicy.fromServer("https://a.example/x", " T ", "", "http://cdn.example/i.jpg", now)
        assertEquals("T", entry.title)
        assertNull(entry.description)
        assertEquals("https://cdn.example/i.jpg", entry.imageUrl)
        assertFalse(entry.failed)
    }

    @Test
    fun `une image qui n'est pas http est ecartee`() {
        val entry = PreviewCachePolicy.fromServer("https://a.example/x", "T", null, "data:image/png;base64,AAAA", now)
        assertNull(entry.imageUrl)
    }
}
