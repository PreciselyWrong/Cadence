package ch.nicolab.cadence.tasks.brief.audio

import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir

class BriefAudioMathTest {
    private val rate = 1000

    private fun clip(id: String, length: Int, value: Short = 1) = ChapterClip(id, id.uppercase(), ShortArray(length) { value })

    @Test
    fun chaptersStartAfterThePreviousClipAndTheSilence() {
        val joined = BriefAudioMath.join(listOf(clip("a", 2000), clip("b", 3000), clip("c", 500)), rate)

        assertEquals(listOf(0L, 2800L, 6600L), joined.chapters.map { it.startMs })
        assertEquals(listOf("a", "b", "c"), joined.chapters.map { it.id })
        assertEquals(listOf("A", "B", "C"), joined.chapters.map { it.title })
    }

    @Test
    fun silenceSitsBetweenClipsOnlyAndLastClipEndsTheFile() {
        val joined = BriefAudioMath.join(listOf(clip("a", 10, 5), clip("b", 10, 7)), rate)

        assertEquals(10 + 800 + 10, joined.samples.size)
        assertArrayEquals(ShortArray(10) { 5 }, joined.samples.copyOfRange(0, 10))
        assertArrayEquals(ShortArray(800), joined.samples.copyOfRange(10, 810))
        assertArrayEquals(ShortArray(10) { 7 }, joined.samples.copyOfRange(810, 820))
        assertEquals(820L, joined.durationMs)
    }

    @Test
    fun aSingleChapterHasNoSilence() {
        val joined = BriefAudioMath.join(listOf(clip("a", 1500)), rate)

        assertEquals(1500, joined.samples.size)
        assertEquals(listOf(0L), joined.chapters.map { it.startMs })
    }

    @Test
    fun noChapterGivesAnEmptyFile() {
        val joined = BriefAudioMath.join(emptyList(), rate)

        assertEquals(0, joined.samples.size)
        assertEquals(emptyList<ChapterMark>(), joined.chapters)
    }

    @Test
    fun offsetsFollowTheRealSampleRate() {
        val joined = BriefAudioMath.join(listOf(clip("a", 22_050), clip("b", 100)), 22_050)

        assertEquals(1800L, joined.chapters[1].startMs)
    }

    @Test
    fun convertsFloatsToClampedSixteenBitSamples() {
        val pcm = BriefAudioMath.toPcm16(floatArrayOf(0f, 1f, -1f, 2f, -3f, 0.5f))

        assertEquals(0, pcm[0].toInt())
        assertEquals(Short.MAX_VALUE.toInt(), pcm[1].toInt())
        assertEquals(-Short.MAX_VALUE, pcm[2].toInt())
        assertEquals(Short.MAX_VALUE.toInt(), pcm[3].toInt())
        assertEquals(-Short.MAX_VALUE, pcm[4].toInt())
        assertEquals(16383, pcm[5].toInt())
    }

    @Test
    fun writesAMonoSixteenBitWavWithItsHeaderSizes(@TempDir dir: File) {
        val file = File(dir, "x.wav")
        val samples = ShortArray(40_000) { (it % 100).toShort() }

        BriefAudioMath.writeWav(file, samples, 22_050)

        val bytes = file.readBytes()
        val header = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        assertEquals("RIFF", String(bytes, 0, 4))
        assertEquals("WAVE", String(bytes, 8, 4))
        assertEquals(36 + 80_000, header.getInt(4))
        assertEquals(1, header.getShort(22).toInt())
        assertEquals(22_050, header.getInt(24))
        assertEquals(16, header.getShort(34).toInt())
        assertEquals(80_000, header.getInt(40))
        assertEquals(44 + 80_000, bytes.size)
        assertEquals(37.toShort(), header.getShort(44 + 37 * 2))
    }

    private val marks = listOf(ChapterMark("a", "A", 0), ChapterMark("b", "B", 10_000), ChapterMark("c", "C", 25_000))

    @Test
    fun theCurrentPartIsNamedByItsTitle() {
        val named = listOf(ChapterMark("intro", "Le point du jour", 0), ChapterMark("tonight", "Priorités du jour", 10_000))

        assertEquals("Le point du jour", ChapterMarks.titleAt(named, 5_000))
        assertEquals("Priorités du jour", ChapterMarks.titleAt(named, 12_000))
        assertNull(ChapterMarks.titleAt(emptyList(), 0))
        assertNull(ChapterMarks.titleAt(listOf(ChapterMark("intro", "", 0)), 0))
    }

    @Test
    fun findsTheChapterThatContainsAPosition() {
        assertEquals(0, ChapterMarks.indexAt(marks, 0))
        assertEquals(0, ChapterMarks.indexAt(marks, 9_999))
        assertEquals(1, ChapterMarks.indexAt(marks, 10_000))
        assertEquals(2, ChapterMarks.indexAt(marks, 99_000))
        assertEquals(-1, ChapterMarks.indexAt(emptyList(), 5))
    }

    @Test
    fun nextChapterStopsAtTheLastOne() {
        assertEquals(10_000L, ChapterMarks.nextStart(marks, 4_000))
        assertEquals(25_000L, ChapterMarks.nextStart(marks, 10_000))
        assertNull(ChapterMarks.nextStart(marks, 30_000))
    }

    @Test
    fun previousRestartsTheChapterThenGoesBack() {
        assertEquals(10_000L, ChapterMarks.previousStart(marks, 20_000))
        assertEquals(0L, ChapterMarks.previousStart(marks, 11_000))
        assertEquals(0L, ChapterMarks.previousStart(marks, 500))
        assertEquals(0L, ChapterMarks.previousStart(emptyList(), 500))
    }
}
