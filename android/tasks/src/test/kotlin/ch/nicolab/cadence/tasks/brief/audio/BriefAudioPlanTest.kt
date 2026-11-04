package ch.nicolab.cadence.tasks.brief.audio

import ch.nicolab.cadence.tasks.brief.AudioDto
import ch.nicolab.cadence.tasks.brief.AudioScriptDto
import ch.nicolab.cadence.tasks.brief.ScriptChapterDto
import java.io.File
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BriefAudioPlanTest {
    private val date = LocalDate.of(2026, 11, 4)

    private fun stored(origin: AudioOrigin, durationMs: Long = 80_000, voice: String? = "piper-siwis", speed: Float? = 1f) =
        StoredAudio(date, 1, origin, File("x"), BriefAudioMeta(durationMs, emptyList(), voice, speed))

    private val ready = AudioDto(status = "ready", durationSeconds = 70.0)

    @Test
    fun localAudioComesFirstEvenWhenTheServerHasOne() {
        val choice = BriefAudioPlan.choose(stored(AudioOrigin.LOCAL), stored(AudioOrigin.SERVER), ready, scriptWords = 200)

        assertEquals(AudioChoice(AudioSource.LOCAL, 2), choice)
    }

    @Test
    fun serverCopyThenServerReadyComeBeforeALocalRender() {
        assertEquals(AudioChoice(AudioSource.SERVER, 1), BriefAudioPlan.choose(null, stored(AudioOrigin.SERVER, 59_000), null, 200))
        assertEquals(AudioChoice(AudioSource.SERVER, 2), BriefAudioPlan.choose(null, null, ready, 200))
    }

    @Test
    fun aServerAudioThatIsNotReadyDoesNotCount() {
        for (status in listOf("none", "pending", "failed", "expired")) {
            assertEquals(AudioSource.RENDER, BriefAudioPlan.choose(null, null, AudioDto(status = status), 120, voiceReady = true).source, status)
        }
    }

    @Test
    fun anInstalledVoiceRendersOnDemandWhenNoFileExists() {
        assertEquals(AudioChoice(AudioSource.RENDER, 2), BriefAudioPlan.choose(null, null, null, 230, voiceReady = true))
    }

    @Test
    fun withoutAnInstalledVoiceListeningOffersTheVoices() {
        assertEquals(AudioChoice(AudioSource.GET_VOICE, 2), BriefAudioPlan.choose(null, null, null, 230, voiceReady = false))
    }

    @Test
    fun theSystemVoiceIsNeverAnOption() {
        assertEquals(setOf("LOCAL", "SERVER", "RENDER", "GET_VOICE", "NONE"), AudioSource.entries.map { it.name }.toSet())
    }

    @Test
    fun withoutAnEngineOrAScriptThereIsNothingToRender() {
        assertEquals(AudioSource.NONE, BriefAudioPlan.choose(null, null, null, 230, voiceReady = true, engineAvailable = false).source)
        assertEquals(AudioSource.NONE, BriefAudioPlan.choose(null, null, null, 0, voiceReady = true).source)
    }

    @Test
    fun nothingToPlayHidesTheButton() {
        assertEquals(AudioChoice(AudioSource.NONE, null), BriefAudioPlan.choose(null, null, null, 0))
        assertEquals(AudioChoice(AudioSource.NONE, null), BriefAudioPlan.choose(null, null, AudioDto(status = "failed"), 0))
    }

    @Test
    fun minutesRoundUpAndNeverShowZero() {
        assertEquals(1, BriefAudioPlan.minutes(1_000))
        assertEquals(1, BriefAudioPlan.minutes(60_000))
        assertEquals(2, BriefAudioPlan.minutes(60_001))
        assertEquals(1, BriefAudioPlan.estimateMinutes(10))
        assertEquals(2, BriefAudioPlan.estimateMinutes(151))
    }

    @Test
    fun countsWordsOfEveryChapter() {
        val script = AudioScriptDto(listOf(ScriptChapterDto("a", "A", "un deux  trois"), ScriptChapterDto("b", "B", " quatre\ncinq ")))

        assertEquals(5, BriefAudioPlan.words(script))
        assertEquals(0, BriefAudioPlan.words(null))
    }

    @Test
    fun aRenderMadeWithOtherSettingsIsStale() {
        val local = stored(AudioOrigin.LOCAL)

        assertTrue(BriefAudioPlan.isCurrent(local, "piper-siwis", 1f))
        assertFalse(BriefAudioPlan.isCurrent(local, "piper-tom", 1f))
        assertFalse(BriefAudioPlan.isCurrent(local, "piper-siwis", 1.2f))
        assertFalse(BriefAudioPlan.isCurrent(stored(AudioOrigin.SERVER), "piper-siwis", 1f))
        assertFalse(BriefAudioPlan.isCurrent(null, "piper-siwis", 1f))
    }

    private fun step(
        stored: StoredAudio? = null,
        voiceReady: Boolean = true,
        engine: Boolean = true,
        words: Int = 200,
        audio: AudioDto? = null,
        failed: Boolean = false,
        speed: Float = 1f,
    ) = BriefAudioPlan.nextStep(stored, voiceReady, engine, "piper-siwis", speed, words, audio, failed)

    @Test
    fun rendersLocallyWhenAVoiceIsInstalledAndNothingIsCurrent() {
        assertEquals(PrepareStep.RENDER_LOCAL, step())
        assertEquals(PrepareStep.RENDER_LOCAL, step(stored = stored(AudioOrigin.LOCAL, speed = 1.5f)))
        assertEquals(PrepareStep.RENDER_LOCAL, step(stored = stored(AudioOrigin.SERVER), audio = ready))
    }

    @Test
    fun aCurrentRenderIsLeftAlone() {
        assertEquals(PrepareStep.NOTHING, step(stored = stored(AudioOrigin.LOCAL)))
    }

    @Test
    fun withoutAVoiceTheServerMp3IsCopiedOnce() {
        assertEquals(PrepareStep.DOWNLOAD_SERVER, step(voiceReady = false, audio = ready))
        assertEquals(PrepareStep.NOTHING, step(voiceReady = false, audio = ready, stored = stored(AudioOrigin.SERVER)))
        assertEquals(PrepareStep.NOTHING, step(voiceReady = false, audio = AudioDto(status = "pending")))
    }

    @Test
    fun noEngineOrNoScriptFallsBackToTheServer() {
        assertEquals(PrepareStep.DOWNLOAD_SERVER, step(engine = false, audio = ready))
        assertEquals(PrepareStep.DOWNLOAD_SERVER, step(words = 0, audio = ready))
        assertEquals(PrepareStep.NOTHING, step(engine = false))
    }

    @Test
    fun aFailedLocalRenderHandsOverToTheServer() {
        assertEquals(PrepareStep.DOWNLOAD_SERVER, step(failed = true, audio = ready))
        assertEquals(PrepareStep.NOTHING, step(failed = true))
        assertEquals(PrepareStep.NOTHING, step(failed = true, audio = ready, stored = stored(AudioOrigin.LOCAL, speed = 2f)))
    }

    @Test
    fun speedIsClampedAndRoundedToTenths() {
        assertEquals(0.5f, BriefAudioPrefs.clampSpeed(0.1f))
        assertEquals(2f, BriefAudioPrefs.clampSpeed(9f))
        assertEquals(1.1f, BriefAudioPrefs.clampSpeed(1.0f + BriefAudioPrefs.SPEED_STEP))
        assertEquals(1.3f, BriefAudioPrefs.clampSpeed(1.2999999f))
    }
}
