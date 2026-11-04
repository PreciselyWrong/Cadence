package ch.nicolab.cadence.tasks.brief.audio

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Réglages de voix et positions de reprise : propres à l'appareil, rangés par brief. */
@RunWith(AndroidJUnit4::class)
class BriefAudioPrefsTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var prefs: BriefAudioPrefs

    @Before
    fun setUp() {
        val store = context.getSharedPreferences("cadence_brief_audio", Context.MODE_PRIVATE)
        store.edit().clear().commit()
        prefs = BriefAudioPrefs(store)
    }

    @Test
    fun nothingIsChosenByDefaultAndSpeedStartsAtOne() {
        prefs.setSpeed(1f)

        assertEquals(1f, prefs.speed.value)
        assertEquals(0L, prefs.position("2026-11-04-v1"))
    }

    @Test
    fun speedIsKeptWithinBounds() {
        prefs.setSpeed(5f)
        assertEquals(2f, prefs.speed.value)
        prefs.setSpeed(0.1f)
        assertEquals(0.5f, prefs.speed.value)
    }

    @Test
    fun voiceChoiceIsKept() {
        prefs.setVoice("piper-tom")

        assertEquals("piper-tom", prefs.voiceId.value)
    }

    @Test
    fun eachBriefKeepsItsOwnResumePosition() {
        prefs.savePosition("2026-11-04-v1", 12_000)
        prefs.savePosition("2026-11-04-v2", 3_000)

        assertEquals(12_000L, prefs.position("2026-11-04-v1"))
        assertEquals(3_000L, prefs.position("2026-11-04-v2"))
        prefs.savePosition("2026-11-04-v1", 0)
        assertEquals(0L, prefs.position("2026-11-04-v1"))
    }

    @Test
    fun prunePositionsForgetsPurgedBriefs() {
        prefs.savePosition("2026-11-01-v1", 1_000)
        prefs.savePosition("2026-11-04-v1", 2_000)

        prefs.prunePositions(setOf("2026-11-04-v1"))

        assertEquals(0L, prefs.position("2026-11-01-v1"))
        assertEquals(2_000L, prefs.position("2026-11-04-v1"))
        assertNull(context.getSharedPreferences("cadence_brief_audio", Context.MODE_PRIVATE).all["position:2026-11-01-v1"])
    }
}
