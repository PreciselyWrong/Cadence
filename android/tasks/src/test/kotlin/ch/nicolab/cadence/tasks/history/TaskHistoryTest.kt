package ch.nicolab.cadence.tasks.history

import java.time.Instant
import java.time.LocalDate
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class TaskHistoryTest {
    private fun parse(json: String) = TaskHistory.parse(Json.parseToJsonElement(json))

    @Test
    fun `plus récent d'abord, étiquette et source choisies`() {
        val lines = parse(
            """[{"id":1,"event_type":"created","metadata":{"source":"web"},"created_at":"2026-11-01T08:00:00.000Z"},
            {"id":2,"event_type":"due_date_changed","old_value":{"due_date":null},"new_value":{"due_date":"2026-11-26"},
             "metadata":{"source":"ai"},"created_at":"2026-11-02T08:00:00.000Z"},
            {"id":3,"event_type":"completed","metadata":{"source":"device"},"created_at":"2026-11-03T08:00:00.000Z"}]""",
        )
        assertEquals(listOf(3L, 2L, 1L), lines.map { it.id })
        assertEquals(HistoryLabel.COMPLETED, lines[0].label)
        assertEquals(HistorySource.DEVICE, lines[0].source)
        assertEquals(HistoryLabel.DUE_DATE, lines[1].label)
        assertNull(lines[1].dueFrom)
        assertEquals(LocalDate.of(2026, 11, 26), lines[1].dueTo)
        assertEquals(HistorySource.AI, lines[1].source)
        assertEquals(Instant.parse("2026-11-01T08:00:00Z"), lines[2].at)
    }

    @Test
    fun `tous les types connus et le repli`() {
        val types = mapOf(
            "name_changed" to HistoryLabel.NAME, "note_changed" to HistoryLabel.NOTE,
            "project_id_changed" to HistoryLabel.PROJECT, "project_changed" to HistoryLabel.PROJECT,
            "status_changed" to HistoryLabel.STATUS, "archived" to HistoryLabel.ARCHIVED,
            "priority_changed" to HistoryLabel.PRIORITY, "tags_changed" to HistoryLabel.TAGS,
            "defer_until_changed" to HistoryLabel.DEFERRED, "comment_added" to HistoryLabel.COMMENT,
            "relation_added" to HistoryLabel.RELATION_ADDED, "relation_removed" to HistoryLabel.RELATION_REMOVED,
            "recurring_occurrence_completed" to HistoryLabel.OCCURRENCE_DONE,
            "recurring_occurrence_skipped" to HistoryLabel.OCCURRENCE_SKIPPED,
            "something_new" to HistoryLabel.OTHER,
        )
        types.forEach { (type, label) ->
            assertEquals(label, parse("""[{"id":1,"event_type":"$type","created_at":"2026-11-01T08:00:00Z"}]""").single().label, type)
        }
    }

    @Test
    fun `sources connues, inconnue ou absente sans étiquette`() {
        val sources = mapOf(
            "web" to HistorySource.WEB, "api" to HistorySource.API, "device" to HistorySource.DEVICE,
            "ai" to HistorySource.AI, "suggestion" to HistorySource.SUGGESTION, "import" to HistorySource.IMPORT,
        )
        sources.forEach { (raw, source) ->
            val line = parse("""[{"id":1,"event_type":"created","metadata":{"source":"$raw"},"created_at":"2026-11-01T08:00:00Z"}]""").single()
            assertEquals(source, line.source, raw)
        }
        assertNull(parse("""[{"id":1,"event_type":"created","metadata":{"source":"hermes"},"created_at":"2026-11-01T08:00:00Z"}]""").single().source)
        assertNull(parse("""[{"id":1,"event_type":"created","created_at":"2026-11-01T08:00:00Z"}]""").single().source)
    }

    @Test
    fun `entrées illisibles ignorées, réponse non liste vide`() {
        assertEquals(listOf(2L), parse("""[{"event_type":"created"},"x",{"id":2,"event_type":"created"}]""").map { it.id })
        assertEquals(emptyList<HistoryLine>(), parse("""{"error":"x"}"""))
    }

    @Test
    fun `échéance en date-heure ISO ramenée au jour`() {
        val line = parse(
            """[{"id":1,"event_type":"due_date_changed","old_value":{"due_date":"2026-11-25T23:00:00.000Z"},
            "new_value":{"due_date":null},"created_at":"2026-11-02T08:00:00Z"}]""",
        ).single()
        assertEquals(LocalDate.of(2026, 11, 25), line.dueFrom)
        assertNull(line.dueTo)
    }
}
