package ch.nicolab.cadence.tasks.data

import ch.nicolab.cadence.tasks.model.LinkKind
import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LinkWireTest {
    private fun wire(text: String) = Json.parseToJsonElement(text).jsonObject

    @Test
    fun `a page reads its metadata, note and project`() {
        val entity = WireCodec.linkFromWire(
            wire(
                """{"uid":"l1","url":"https://github.com/o/r","title":"o/r","description":"A CLI","image_url":null,
                "site_name":"GitHub","kind":"repo","github_stars":42,"github_language":"Go",
                "github_last_commit":"2026-10-30T10:00:00.000Z","readme_excerpt":"Hello","note":"pour Q1",
                "project_uid":"p1","fetch_status":"done","fetched_at":"2026-10-31T00:00:00.000Z",
                "created_at":"2026-10-31T00:00:00.000Z"}""",
            ),
        )
        val item = LinkRow(entity, pendingSync = false).toItem()
        assertEquals("o/r", item.displayTitle)
        assertEquals("github.com", item.domain)
        assertEquals(LinkKind.REPO, item.kind)
        assertEquals(42, item.githubStars)
        assertEquals(Instant.parse("2026-10-30T10:00:00Z"), item.githubLastCommit)
        assertEquals("pour Q1", item.note)
        assertEquals("p1", item.projectUid)
        assertFalse(item.fetching)
    }

    @Test
    fun `a page still being read is marked as fetching`() {
        val item = LinkRow(
            WireCodec.linkFromWire(wire("""{"uid":"l2","url":"https://a.io/","project_uid":"p1","fetch_status":"pending"}""")),
            pendingSync = true,
        ).toItem()
        assertTrue(item.fetching)
        assertTrue(item.pendingSync)
        assertEquals("a.io", item.displayTitle)
    }

    @Test
    fun `fields the page no longer has, sent by an old client, are ignored`() {
        val item = LinkRow(
            WireCodec.linkFromWire(
                wire("""{"uid":"l3","url":"https://a.io/","project_uid":"p1","status":"parked","review_at":"2027-01-02","tag_uids":["t1"],"source_type":"task","source_uid":"t9"}"""),
            ),
            pendingSync = false,
        ).toItem()
        assertEquals("p1", item.projectUid)
        assertEquals("https://a.io/", item.url)
    }
}
