package ch.nicolab.cadence.tasks.brief.audio

import java.io.File
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir

class BriefAudioFilesTest {
    @TempDir
    lateinit var root: File

    private val today = LocalDate.of(2026, 11, 10)
    private val meta = BriefAudioMeta(90_000, listOf(ChapterMarkJson("intro", "Intro", 0), ChapterMarkJson("tonight", "Ce soir", 20_000)), "piper-siwis", 1f)

    private fun files() = BriefAudioFiles(File(root, "audio"))

    private fun publish(files: BriefAudioFiles, date: LocalDate, version: Int, origin: AudioOrigin = AudioOrigin.LOCAL, meta: BriefAudioMeta = this.meta) {
        files.directory()
        val part = files.partFile(date, version, origin)
        part.writeText("audio")
        files.commit(date, version, origin, part, meta)
    }

    @Test
    fun aCommittedFileIsFoundWithItsChapterOffsets() {
        val files = files()
        publish(files, today, 2)

        val found = files.find(today, 2)!!

        assertEquals(AudioOrigin.LOCAL, found.origin)
        assertEquals("2026-11-10-v2", found.key)
        assertEquals(listOf(0L, 20_000L), found.meta.marks().map { it.startMs })
        assertEquals(found.key, files.findByKey("2026-11-10-v2")!!.key)
    }

    @Test
    fun aVersionWithoutItsSheetOrFileIsNotReady() {
        val files = files()
        publish(files, today, 1)
        files.metaFile(today, 1).delete()
        assertNull(files.find(today, 1))

        publish(files, today, 3)
        files.audioFile(today, 3, AudioOrigin.LOCAL).delete()
        assertNull(files.find(today, 3))
        assertNull(files.find(today, 9))
    }

    @Test
    fun committingTheOtherOriginDropsTheFirstOne() {
        val files = files()
        publish(files, today, 1, AudioOrigin.SERVER, BriefAudioMeta(70_000, emptyList()))
        publish(files, today, 1, AudioOrigin.LOCAL)

        assertFalse(files.audioFile(today, 1, AudioOrigin.SERVER).exists())
        assertEquals(AudioOrigin.LOCAL, files.find(today, 1)!!.origin)
    }

    @Test
    fun purgeDeletesFilesOlderThanSevenDaysAndKeepsTheRest() {
        val files = files()
        publish(files, today.minusDays(8), 1)
        publish(files, today.minusDays(7), 1)
        publish(files, today.minusDays(1), 1, AudioOrigin.SERVER)
        publish(files, today, 1)

        val removed = files.purge(today)

        assertEquals(setOf("2026-11-02-v1.wav", "2026-11-02-v1.json"), removed.map { it.name }.toSet())
        assertEquals(setOf("2026-11-03-v1", "2026-11-09-v1", "2026-11-10-v1"), files.keys())
        assertNull(files.find(today.minusDays(8), 1))
        assertTrue(files.find(today.minusDays(7), 1) != null)
    }

    @Test
    fun purgeKeepsOnlyTheCurrentVersionOfTheKeptDay() {
        val files = files()
        publish(files, today, 1)
        publish(files, today, 2)
        publish(files, today.minusDays(1), 1)

        files.purge(today, keep = today to 2)

        assertEquals(setOf("2026-11-10-v2", "2026-11-09-v1"), files.keys())
    }

    @Test
    fun purgeRemovesUnknownFilesAndInterruptedParts() {
        val files = files()
        publish(files, today, 1)
        File(files.directory(), "random.txt").writeText("x")
        File(files.directory(), "2026-11-01-v1.wav.part").writeText("x")
        files.partFile(today, 1, AudioOrigin.SERVER).writeText("x")

        files.purge(today, keep = today to 1)

        assertEquals(setOf("2026-11-10-v1.wav", "2026-11-10-v1.json", "2026-11-10-v1.mp3.part"), files.directory().list()!!.toSet())
    }

    @Test
    fun deletingAVoiceDropsItsRendersAndKeepsTheServerCopies() {
        val files = files()
        publish(files, today, 1, meta = meta.copy(voice = "piper-tom"))
        publish(files, today.minusDays(1), 1, meta = meta.copy(voice = "piper-siwis"))
        publish(files, today.minusDays(2), 1, AudioOrigin.SERVER, BriefAudioMeta(1000, emptyList()))

        files.deleteRenderedWith("piper-tom")

        assertNull(files.find(today, 1))
        assertTrue(files.find(today.minusDays(1), 1) != null)
        assertTrue(files.find(today.minusDays(2), 1) != null)
    }

    @Test
    fun parsesOnlyWellFormedKeys() {
        assertEquals(LocalDate.of(2026, 11, 4) to 12, BriefAudioFiles.parseKey("2026-11-04-v12"))
        assertNull(BriefAudioFiles.parseKey("2026-13-04-v1"))
        assertNull(BriefAudioFiles.parseKey("../2026-11-04-v1"))
        assertNull(BriefAudioFiles.parseKey("2026-11-04-v"))
        assertNull(BriefAudioFiles().findByKey("../../etc/passwd"))
    }

    private fun BriefAudioFiles() = files()
}
