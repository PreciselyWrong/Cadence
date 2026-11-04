package ch.nicolab.cadence.tasks.brief.audio

import ch.nicolab.cadence.tasks.brief.BriefCodec
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class BriefAudioDocumentTest {
    @Test
    fun readsTheScriptChaptersAndTheServerAudio() {
        val brief = BriefCodec.decode(
            """
            {"schema":1,"date":"2026-11-04",
             "audio_script":{"chapters":[{"id":"intro","title":"Introduction","text":"Bonjour."},{"id":"tonight","title":"Ce soir","text":"Trois choses."}]},
             "audio":{"status":"ready","path":"x","duration_seconds":74.5,"chapters":[{"id":"intro","start_seconds":0},{"id":"tonight","start_seconds":21.25}],"voice":"fr","error":null}}
            """.trimIndent(),
        )

        assertEquals(listOf("intro", "tonight"), brief.audioScript!!.chapters.map { it.id })
        assertEquals("Trois choses.", brief.audioScript!!.chapters[1].text)
        assertEquals("ready", brief.audio!!.status)
        assertEquals(74.5, brief.audio!!.durationSeconds!!, 0.0)
        assertEquals(21.25, brief.audio!!.chapters[1].startSeconds, 0.0)
    }

    @Test
    fun aBriefWithoutAudioStillReads() {
        val brief = BriefCodec.decode("""{"schema":1,"date":"2026-11-04","audio":{"status":"none","duration_seconds":null,"chapters":[]}}""")

        assertNull(brief.audioScript)
        assertEquals("none", brief.audio!!.status)
        assertNull(brief.audio!!.durationSeconds)
        assertEquals(0, BriefAudioPlan.words(brief.audioScript))
    }
}
