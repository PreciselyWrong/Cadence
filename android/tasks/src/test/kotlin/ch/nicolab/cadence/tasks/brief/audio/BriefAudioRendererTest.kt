package ch.nicolab.cadence.tasks.brief.audio

import ch.nicolab.cadence.tasks.brief.ScriptChapterDto
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir

class BriefAudioRendererTest {
    @TempDir
    lateinit var root: File

    private val date = LocalDate.of(2026, 11, 4)
    private val voice = BriefVoiceCatalog.voices.first()

    /** Un son par caractère du texte (1 000 échantillons), sans moteur natif. */
    private class FakeSynthesizer(val rate: Int = 1000) : VoiceSynthesizer {
        val texts = ArrayList<String>()
        val speeds = ArrayList<Float>()
        var closed = false

        override fun synthesize(voice: BriefVoice, voiceDir: File, text: String, speed: Float, active: () -> Boolean): PcmClip {
            texts += text
            speeds += speed
            return PcmClip(rate, FloatArray(text.length * 100) { 0.25f })
        }

        override fun close() {
            closed = true
        }
    }

    private fun chapters(vararg texts: String) = texts.mapIndexed { i, text -> ScriptChapterDto("c$i", "Chapitre $i", text) }

    private fun renderer(fake: FakeSynthesizer?) =
        BriefAudioFiles(File(root, "audio")) to BriefVoiceStore(File(root, "voices")).let { store ->
            BriefAudioRenderer(BriefAudioFiles(File(root, "audio")), store) { fake }
        }

    @Test
    fun rendersEveryChapterIntoOneFileWithOffsets() {
        val fake = FakeSynthesizer()
        val (files, renderer) = renderer(fake)

        val stored = renderer.render(date, 3, chapters("aaaaa", "bbb", "cc"), voice, 1.2f, active = { true })!!

        assertEquals(listOf("aaaaa", "bbb", "cc"), fake.texts)
        assertEquals(listOf(1.2f, 1.2f, 1.2f), fake.speeds)
        assertTrue(fake.closed)
        assertEquals(listOf(0L, 500 + 800L, 500 + 800 + 300 + 800L), stored.meta.marks().map { it.startMs })
        assertEquals(500 + 800 + 300 + 800 + 200L, stored.meta.durationMs)
        assertEquals(voice.id, stored.meta.voice)
        assertEquals(1.2f, stored.meta.speed)
        assertEquals(stored.key, files.find(date, 3)!!.key)
        val header = ByteBuffer.wrap(stored.file.readBytes()).order(ByteOrder.LITTLE_ENDIAN)
        assertEquals(1000, header.getInt(24))
        assertEquals(stored.meta.durationMs.toInt() * 2, header.getInt(40))
    }

    @Test
    fun blankChaptersAreSkippedAndAnEmptyScriptRendersNothing() {
        val fake = FakeSynthesizer()
        val (_, renderer) = renderer(fake)

        val stored = renderer.render(date, 1, chapters("  ", "dit", ""), voice, 1f, active = { true })!!

        assertEquals(listOf("dit"), fake.texts)
        assertEquals(listOf(0L), stored.meta.marks().map { it.startMs })
        assertNull(renderer.render(date, 2, chapters("", " "), voice, 1f, active = { true }))
    }

    @Test
    fun withoutAnEngineNothingIsWritten() {
        val (files, renderer) = renderer(null)

        assertThrows(IllegalStateException::class.java) { renderer.render(date, 1, chapters("texte"), voice, 1f, active = { true }) }

        assertNull(files.find(date, 1))
    }

    @Test
    fun cancellationLeavesNoFileBehind() {
        val (files, renderer) = renderer(FakeSynthesizer())
        var calls = 0

        assertThrows(CancellationException::class.java) {
            renderer.render(date, 1, chapters("un", "deux"), voice, 1f, active = { ++calls < 3 })
        }

        assertNull(files.find(date, 1))
        assertFalse(files.directory().listFiles().orEmpty().any { it.name.endsWith(".part") || it.name.endsWith(".wav") })
    }

    @Test
    fun anEngineFailureLeavesNoFileAndClosesTheEngine() {
        val fake = object : VoiceSynthesizer {
            var closed = false
            override fun synthesize(voice: BriefVoice, voiceDir: File, text: String, speed: Float, active: () -> Boolean): PcmClip =
                throw IllegalStateException("boom")

            override fun close() {
                closed = true
            }
        }
        val files = BriefAudioFiles(File(root, "audio"))
        val renderer = BriefAudioRenderer(files, BriefVoiceStore(File(root, "voices"))) { fake }

        assertThrows(IllegalStateException::class.java) { renderer.render(date, 1, chapters("texte"), voice, 1f, active = { true }) }

        assertTrue(fake.closed)
        assertNull(files.find(date, 1))
        assertTrue(files.directory().listFiles().orEmpty().isEmpty())
    }
}
