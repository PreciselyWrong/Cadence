package ch.nicolab.cadence.tasks.brief

import ch.nicolab.cadence.tasks.brief.audio.BriefAudioFiles
import java.time.LocalDate
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class EveningDocumentTest {
    /** Réponse de `GET /daily-plan/:date/evening` selon `docs/39-daily-brief.md`, avec des clés inconnues. */
    private val response = """
        {
          "date": "2026-11-04",
          "tasks": {"t1": {"uid": "t1"}},
          "evening": {
            "schema": 1, "date": "2026-11-04", "generated_at": "2026-11-04T18:02:00Z", "future": 1,
            "verdict": {"text": "Bonne journée : cinq tâches faites.", "by": "rules"},
            "counters": {"done": 5, "slipped": 2, "tonight_minutes": 45, "capacity_minutes": 90},
            "done": ["d1", "d2"],
            "tonight": [{"task_uid": "t1", "minutes": 30}],
            "slipped": [{"task_uid": "s1", "reason": "prévue aujourd'hui"}],
            "carry_over": ["t1", "s1"],
            "tomorrow": {"date": "2026-11-05", "work": [], "events": [], "task_uids": ["x"], "load": {"planned_minutes": 20}, "flags": []},
            "audio_script": {"chapters": [
              {"id": "intro", "title": "Introduction", "text": "Bonsoir."},
              {"id": "tomorrow", "title": "Demain", "text": "Demain, rien."}]}
          }
        }
    """.trimIndent()

    private fun decode(text: String = response): EveningDto {
        val root = Json.parseToJsonElement(text) as JsonObject
        return EveningCodec.decode(EveningCodec.envelope(root).eveningJson!!)
    }

    @Test
    fun readsEverySectionAndIgnoresUnknownKeys() {
        val evening = decode()

        assertEquals("Bonne journée : cinq tâches faites.", evening.verdict.text)
        assertEquals(5, evening.counters.done)
        assertEquals(2, evening.counters.slipped)
        assertEquals(90, evening.counters.capacityMinutes)
        assertEquals(listOf("d1", "d2"), evening.done)
        assertEquals("t1", evening.tonight.single().taskUid)
        assertEquals(30, evening.tonight.single().minutes)
        assertEquals("prévue aujourd'hui", evening.slipped.single().reason)
        assertEquals(listOf("t1", "s1"), evening.carryOver)
        assertEquals(listOf("x"), evening.tomorrow!!.taskUids)
        assertEquals(listOf("intro", "tomorrow"), evening.audioScript!!.chapters.map { it.id })
    }

    @Test
    fun theEnvelopeKeepsTheEveningAsRawJsonForTheCache() {
        val envelope = EveningCodec.envelope(Json.parseToJsonElement(response) as JsonObject)

        assertEquals("2026-11-04", envelope.date)
        assertTrue(envelope.eveningJson!!.contains("carry_over"))
        assertNull(EveningCodec.envelope(Json.parseToJsonElement("""{"date":"2026-11-04","evening":null}""") as JsonObject).eveningJson)
    }

    @Test
    fun aSparseEveningStillReads() {
        val evening = EveningCodec.decode("""{"schema":1,"date":"2026-11-04"}""")

        assertTrue(evening.done.isEmpty() && evening.tonight.isEmpty() && evening.slipped.isEmpty())
        assertNull(evening.tomorrow)
        assertNull(CachedEvening(LocalDate.of(2026, 11, 4), evening, 0).audioTarget())
    }

    @Test
    fun theAudioFileFollowsTheScriptText() {
        val day = LocalDate.of(2026, 11, 4)
        val first = CachedEvening(day, decode(), 1).audioTarget()!!
        val again = CachedEvening(day, decode(), 99).audioTarget()!!
        val changed = CachedEvening(day, decode(response.replace("Bonsoir.", "Bonsoir, cinq faites.")), 2).audioTarget()!!

        assertTrue(BriefAudioFiles.isEvening(first.version))
        assertEquals(first.version, again.version)
        assertNotEquals(first.version, changed.version)
        assertEquals(day, first.date)
        assertNull(first.server)
    }
}
