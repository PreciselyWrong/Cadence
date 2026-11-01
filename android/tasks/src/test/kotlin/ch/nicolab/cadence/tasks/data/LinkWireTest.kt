package ch.nicolab.cadence.tasks.data

import ch.nicolab.cadence.tasks.model.LinkKind
import ch.nicolab.cadence.tasks.model.LinkStatus
import java.time.Instant
import java.time.LocalDate
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LinkWireTest {
    private fun wire(text: String) = Json.parseToJsonElement(text).jsonObject

    @Test
    fun `a link reads its metadata, note, status and tags`() {
        val entity = WireCodec.linkFromWire(
            wire(
                """{"uid":"l1","url":"https://github.com/o/r","title":"o/r","description":"A CLI","image_url":null,
                "site_name":"GitHub","kind":"repo","github_stars":42,"github_language":"Go",
                "github_last_commit":"2026-10-30T10:00:00.000Z","readme_excerpt":"Hello","note":"pour Q1",
                "status":"parked","tag_uids":["t1"],"source_type":"inbox_item","source_uid":"i1",
                "fetch_status":"done","fetched_at":"2026-10-31T00:00:00.000Z","created_at":"2026-10-31T00:00:00.000Z"}""",
            ),
        )
        val item = LinkRow(entity, pendingSync = false).toItem()
        assertEquals("o/r", item.displayTitle)
        assertEquals("github.com", item.domain)
        assertEquals(LinkKind.REPO, item.kind)
        assertEquals(42, item.githubStars)
        assertEquals(Instant.parse("2026-10-30T10:00:00Z"), item.githubLastCommit)
        assertEquals("pour Q1", item.note)
        assertEquals(LinkStatus.PARKED, item.status)
        assertEquals(listOf("t1"), item.tagUids)
        assertEquals("i1", item.sourceUid)
        assertFalse(item.fetching)
    }

    @Test
    fun `a link still being read is marked as fetching`() {
        val item = LinkRow(
            WireCodec.linkFromWire(wire("""{"uid":"l2","url":"https://a.io/","fetch_status":"pending"}""")),
            pendingSync = true,
        ).toItem()
        assertTrue(item.fetching)
        assertTrue(item.pendingSync)
        assertEquals(LinkStatus.NEW, item.status)
        assertEquals("a.io", item.displayTitle)
    }

    @Test
    fun `a parked link reads the day to look at it again`() {
        val entity = WireCodec.linkFromWire(
            wire("""{"uid":"l1","url":"https://a.io/","status":"parked","review_at":"2027-01-02","tag_uids":[]}"""),
        )

        assertEquals(LocalDate.of(2027, 1, 2), LinkRow(entity, pendingSync = false).toItem().reviewAt)
    }
}
