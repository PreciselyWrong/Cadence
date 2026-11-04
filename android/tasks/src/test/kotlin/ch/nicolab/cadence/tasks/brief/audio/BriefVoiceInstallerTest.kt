package ch.nicolab.cadence.tasks.brief.audio

import java.io.File
import java.io.IOException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir

@OptIn(ExperimentalCoroutinesApi::class)
class BriefVoiceInstallerTest {
    @TempDir
    lateinit var root: File

    private val siwis = BriefVoiceCatalog.voices.first()

    @Test
    fun downloadingReportsProgressThenSettlesAndNotifiesTheInstall() = runTest {
        val seen = mutableListOf<Float>()
        val events = mutableListOf<String>()
        lateinit var installer: BriefVoiceInstaller
        installer = BriefVoiceInstaller(
            BriefVoiceStore(root),
            this,
            StandardTestDispatcher(testScheduler),
            fetch = { voice, _, _, progress ->
                events += "start:${installer.state.value.downloadingId}"
                progress(voice.pack.bytes / 4)
                seen += installer.state.value.progress
                progress(voice.pack.bytes)
                seen += installer.state.value.progress
            },
        )

        installer.download(siwis, onInstalled = { events += "installed" }, onSettled = { events += "settled" })
        advanceUntilIdle()

        assertEquals(listOf("start:${siwis.id}", "installed", "settled"), events)
        assertEquals(listOf(0.25f, 1f), seen)
        assertEquals(VoiceInstallState(), installer.state.value)
    }

    @Test
    fun aFailureKeepsItsMessageAndInstallsNothing() = runTest {
        var installed = false
        val installer = BriefVoiceInstaller(
            BriefVoiceStore(root),
            this,
            StandardTestDispatcher(testScheduler),
            fetch = { _, _, _, _ -> throw IOException("réseau coupé") },
            failure = { "Échec : ${it.message}" },
        )

        installer.download(siwis, onInstalled = { installed = true })
        advanceUntilIdle()

        assertEquals(false, installed)
        assertEquals("Échec : réseau coupé", installer.state.value.message)
        assertNull(installer.state.value.downloadingId)
        installer.clearMessage()
        assertNull(installer.state.value.message)
    }

    @Test
    fun cancellingStopsWithoutAMessageAndCleansTheLeftovers() = runTest {
        val store = BriefVoiceStore(root)
        lateinit var installer: BriefVoiceInstaller
        var installed = false
        installer = BriefVoiceInstaller(
            store,
            this,
            StandardTestDispatcher(testScheduler),
            fetch = { voice, target, check, _ ->
                File(root, voice.pack.id + ".part").apply { parentFile!!.mkdirs() }.writeText("partiel")
                installer.cancel()
                check()
                target.directory(voice.pack)
            },
        )

        installer.download(siwis, onInstalled = { installed = true })
        advanceUntilIdle()

        assertEquals(false, installed)
        assertNull(installer.state.value.message)
        assertNull(installer.state.value.downloadingId)
        assertTrue(!File(root, siwis.pack.id + ".part").exists())
    }

    @Test
    fun aSecondDownloadWhileOneRunsIsIgnored() = runTest {
        val started = mutableListOf<String>()
        lateinit var installer: BriefVoiceInstaller
        installer = BriefVoiceInstaller(
            BriefVoiceStore(root),
            this,
            StandardTestDispatcher(testScheduler),
            fetch = { voice, _, _, _ ->
                started += voice.id
                installer.download(BriefVoiceCatalog.voices.last())
            },
        )

        installer.download(siwis)
        advanceUntilIdle()

        assertEquals(listOf(siwis.id), started)
    }
}
