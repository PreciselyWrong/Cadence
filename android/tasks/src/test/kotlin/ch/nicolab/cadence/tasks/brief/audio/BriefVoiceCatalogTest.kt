package ch.nicolab.cadence.tasks.brief.audio

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BriefVoiceCatalogTest {
    @Test
    fun offersSiwisAndTomWithTheirLicenses() {
        val siwis = BriefVoiceCatalog.find("piper-siwis")
        val tom = BriefVoiceCatalog.find("piper-tom")

        assertNotNull(siwis)
        assertNotNull(tom)
        assertEquals("CC BY 4.0", siwis!!.license)
        assertEquals("AGPL-3.0", tom!!.license)
    }

    @Test
    fun everyPackageIsPinnedByAFullSha256AndASize() {
        BriefVoiceCatalog.voices.forEach { voice ->
            assertTrue(Regex("[0-9a-f]{64}").matches(voice.pack.sha256), voice.id)
            assertTrue(voice.pack.bytes > 0 && voice.pack.maxExpandedBytes > voice.pack.bytes, voice.id)
            assertTrue(voice.modelFile in voice.pack.required, voice.id)
        }
        assertEquals(BriefVoiceCatalog.voices.size, BriefVoiceCatalog.voices.map { it.id }.toSet().size)
    }

    @Test
    fun downloadsComeFromTheSherpaReleaseOverHttps() {
        BriefVoiceCatalog.voices.forEach { voice ->
            val url = java.net.URI(voice.url).toURL()
            assertTrue(BriefVoiceDownload.allowed(url), voice.url)
            assertTrue(voice.url.endsWith("${voice.pack.archiveRoot}.tar.bz2"))
        }
    }

    @Test
    fun refusesOtherHostsAndPlainHttp() {
        assertTrue(!BriefVoiceDownload.allowed(java.net.URI("http://github.com/x").toURL()))
        assertTrue(!BriefVoiceDownload.allowed(java.net.URI("https://example.com/x").toURL()))
        assertTrue(!BriefVoiceDownload.allowed(java.net.URI("https://user@github.com/x").toURL()))
    }

    @Test
    fun anUnknownVoiceFallsBackToTheFirstOne() {
        assertNull(BriefVoiceCatalog.find("gone"))
        assertEquals(BriefVoiceCatalog.DEFAULT_ID, BriefVoiceCatalog.resolve("gone").id)
        assertEquals(BriefVoiceCatalog.DEFAULT_ID, BriefVoiceCatalog.resolve(null).id)
    }
}
