package ch.nicolab.cadence.tasks.brief.audio

import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.file.Files
import java.security.MessageDigest
import java.util.concurrent.CancellationException
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorOutputStream
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.fail
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir

class BriefVoiceStoreTest {
    @TempDir
    lateinit var root: File

    private fun archive(name: String = "pack/model.onnx", symlink: Boolean = false): ByteArray {
        val out = ByteArrayOutputStream()
        TarArchiveOutputStream(BZip2CompressorOutputStream(out)).use { tar ->
            val entry = if (symlink) TarArchiveEntry(name, '2'.code.toByte()) else TarArchiveEntry(name)
            if (symlink) entry.linkName = "../../outside" else entry.size = 5
            tar.putArchiveEntry(entry)
            if (!symlink) tar.write(byteArrayOf(1, 2, 3, 4, 5))
            tar.closeArchiveEntry()
        }
        return out.toByteArray()
    }

    private fun spec(data: ByteArray, max: Long = 100) = VoicePackage(
        "voice", "pack", data.size.toLong(),
        MessageDigest.getInstance("SHA-256").digest(data).joinToString("") { "%02x".format(it) },
        listOf("model.onnx"), max,
    )

    private fun fails(block: () -> Unit) {
        try {
            block()
            fail("Expected a rejection")
        } catch (_: AssertionError) {
            throw AssertionError("Expected a rejection")
        } catch (_: Exception) {
            // refus attendu
        }
    }

    @Test
    fun installsThenRemovesOnlyTheSelectedVoice() {
        val store = BriefVoiceStore(root)
        val data = archive()
        val pack = spec(data)
        File(root, "other").mkdir()
        File(root, "other/keep.wav").writeText("keep")

        store.install(pack, data.inputStream())

        assertTrue(store.installed(pack))
        assertTrue(store.bytes(pack) >= 5)
        store.remove(pack)
        assertFalse(store.installed(pack))
        assertEquals("keep", File(root, "other/keep.wav").readText())
        assertFalse(root.listFiles()!!.any { it.name.endsWith(".staging") || it.name.endsWith(".part") })
    }

    @Test
    fun reportsProgressInBytes() {
        val store = BriefVoiceStore(root)
        val data = archive()
        var last = 0L

        store.install(spec(data), data.inputStream(), progress = { last = it })

        assertEquals(data.size.toLong(), last)
    }

    @Test
    fun rejectsACorruptTruncatedOrIncompletePackage() {
        val store = BriefVoiceStore(root)
        val data = archive()
        val pack = spec(data)

        fails { store.install(pack.copy(sha256 = "0".repeat(64)), data.inputStream()) }
        fails { store.install(pack, data.copyOf(data.size - 3).inputStream()) }
        fails { store.install(pack.copy(required = listOf("missing")), data.inputStream()) }

        assertFalse(store.installed(pack))
        assertEquals(0, root.listFiles()!!.size)
    }

    @Test
    fun rejectsTraversalLinksAndExpansionBombs() {
        val store = BriefVoiceStore(root)
        for (data in listOf(archive("pack/../../escape"), archive("pack/model.onnx", symlink = true), archive("/absolute"))) {
            fails { store.install(spec(data), data.inputStream()) }
        }
        val data = archive()
        fails { store.install(spec(data, max = 4), data.inputStream()) }

        assertEquals(0, root.listFiles()!!.size)
    }

    @Test
    fun cancellationLeavesNothingBehind() {
        val store = BriefVoiceStore(root)
        val data = archive()
        val pack = spec(data)

        try {
            store.install(pack, data.inputStream(), checkActive = { throw CancellationException() })
            fail("Expected cancellation")
        } catch (_: CancellationException) {
            // attendu
        }

        assertFalse(store.installed(pack))
        assertEquals(0, root.listFiles()!!.size)
    }

    @Test
    fun aDirectoryWithoutTheReceiptIsNeverInstalled() {
        val store = BriefVoiceStore(root)
        val pack = spec(archive())
        store.directory(pack).mkdirs()
        File(store.directory(pack), "model.onnx").writeText("partial")

        assertFalse(store.installed(pack))
    }

    @Test
    fun aReceiptForAnotherHashIsNotAnInstall() {
        val store = BriefVoiceStore(root)
        val data = archive()
        val pack = spec(data)
        store.install(pack, data.inputStream())

        assertFalse(store.installed(pack.copy(sha256 = "1".repeat(64))))
    }

    @Test
    fun refusesPackageNamesThatEscapeTheRoot() {
        val store = BriefVoiceStore(root)
        val data = archive()

        fails { store.directory(spec(data).copy(id = "../up")) }
    }

    @Test
    fun refusesASymbolicLinkAsAPackageDirectory() {
        val store = BriefVoiceStore(root)
        val target = Files.createTempDirectory(root.toPath(), "elsewhere")
        Files.createSymbolicLink(File(root, "voice").toPath(), target)

        fails { store.directory(spec(archive())) }
    }
}
