package ch.nicolab.cadence.tasks.brief

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BriefDocumentTest {
    /** Brief complet selon `docs/39-daily-brief.md`, avec des clés inconnues à chaque niveau. */
    private val fixture = """
        {
          "schema": 1, "date": "2026-11-04", "future_root": {"x": 1},
          "sections": ["verdict","timeline","tonight","moves","anticipate","replies","inbox","resolved"],
          "sources": [{"id": "mail", "status": "not_configured", "detail": "agent"}],
          "counters": {"due_today": 4, "overdue": 2, "tonight_minutes": 70, "capacity_minutes": 90, "conflicts": 1, "replies": 0, "extra": 9},
          "verdict": {"text": "Ce soir, une seule chose compte.", "by": "rules"},
          "timeline": [{
            "date": "2026-11-04",
            "work": [{"start": 480, "end": 1020, "label": "Travail"}],
            "events": [{"ref": "event:f:e:2026", "series_ref": null, "title": "Dentiste", "all_day": false, "start_minute": 780, "end_minute": 840, "calendar": "Perso", "conflict": true}],
            "task_uids": ["t1"],
            "load": {"planned_minutes": 40, "capacity_minutes": 90, "hypothesis": true, "note": "estimé"},
            "flags": ["overloaded"]
          }],
          "tonight": [{"task_uid": "t1", "reason": "échéance demain", "minutes": 40}],
          "moves": [{"proposal_key": "m1", "task_uid": "t2", "from": "2026-11-04", "to": "2026-11-07", "reason": "Reportée 3 fois"}],
          "anticipate": [{"key": "k1", "type": "conflict", "text": "Conflit", "task_uids": [], "event_refs": ["event:f:e:2026"],
            "question": {"key": "q1", "text": "Garage jeudi ?", "target": {"scope": "event", "ref": "event:f:e:2026"}}}],
          "replies": [{"account": "a", "thread_ref": "r1", "from": "Club", "subject": "Tournoi", "date": "2026-11-02T10:00:00Z", "summary": "s", "link": "https://x"}],
          "inbox": [{"uid": "i1", "title": "Idée cadeau", "proposal": {"action": "task", "reason": "à faire"}}],
          "resolved": [{"task_uid": "t9", "completed_at": "2026-11-03T18:00:00Z"}],
          "audio_script": {"chapters": []},
          "audio": {"status": "none"}
        }
    """.trimIndent()

    @Test
    fun parsesEverySectionAndIgnoresUnknownKeys() {
        val brief = BriefCodec.decode(fixture)

        assertEquals("2026-11-04", brief.date)
        assertEquals(listOf("verdict", "timeline", "tonight", "moves", "anticipate", "replies", "inbox", "resolved"), brief.sections)
        assertEquals(4, brief.counters.dueToday)
        assertEquals(2, brief.counters.overdue)
        assertEquals(70, brief.counters.tonightMinutes)
        assertEquals(90, brief.counters.capacityMinutes)
        assertEquals("Ce soir, une seule chose compte.", brief.verdict.text)

        val day = brief.timeline.single()
        assertEquals(480, day.work.single().start)
        assertEquals("Dentiste", day.events.single().title)
        assertTrue(day.events.single().conflict)
        assertNull(day.events.single().seriesRef)
        assertEquals(40, day.load.plannedMinutes)
        assertEquals(listOf("t1"), day.taskUids)

        assertEquals("t1", brief.tonight.single().taskUid)
        assertEquals("2026-11-07", brief.moves.single().to)
        assertEquals("q1", brief.anticipate.single().question?.key)
        assertEquals("event", brief.anticipate.single().question?.target?.scope)
        assertEquals("Club", brief.replies.single().from)
        assertEquals("Idée cadeau", brief.inbox.single().title)
        assertEquals("t9", brief.resolved.single().taskUid)
        assertEquals("mail", brief.sources.single().id)
    }

    @Test
    fun missingSectionsStayEmptyInsteadOfFailing() {
        val brief = BriefCodec.decode("""{"date": "2026-11-04"}""")

        assertNull(brief.sections)
        assertTrue(brief.timeline.isEmpty())
        assertEquals(0, brief.counters.overdue)
    }

    @Test
    fun envelopeKeepsTheBriefAsRawJsonAndDropsTasks() {
        val root = Json.parseToJsonElement(
            """{"brief": $fixture, "version": 3, "status": "ready", "generated_at": "2026-11-04T06:00:00Z", "tasks": {"t1": {"name": "x"}}}""",
        ).jsonObject

        val envelope = BriefCodec.envelope(root)

        assertEquals(3, envelope.version)
        assertEquals("ready", envelope.status)
        assertEquals("2026-11-04T06:00:00Z", envelope.generatedAt)
        assertEquals("2026-11-04", BriefCodec.decode(envelope.briefJson!!).date)
    }

    @Test
    fun envelopeWithoutBriefHasNoJson() {
        val root = Json.parseToJsonElement("""{"brief": null, "version": 0, "status": "", "tasks": {}}""").jsonObject

        assertNull(BriefCodec.envelope(root).briefJson)
        assertTrue(root["brief"] == JsonNull)
    }
}
