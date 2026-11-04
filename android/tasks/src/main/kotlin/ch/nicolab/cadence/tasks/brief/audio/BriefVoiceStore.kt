package ch.nicolab.cadence.tasks.brief.audio

import java.io.File
import java.io.IOException
import java.io.InputStream
import java.nio.file.FileVisitResult
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.SimpleFileVisitor
import java.nio.file.attribute.BasicFileAttributes
import java.security.MessageDigest
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream

/**
 * Voix installées dans les fichiers de l'application. L'installation vérifie la taille et le SHA-256 de l'archive,
 * refuse chemins hors dossier, liens, doublons et décompression démesurée, puis déplace le dossier d'un coup : un
 * dossier sans reçu `.installed` ne compte jamais comme installé. Les appels sont sérialisés par l'appelant.
 */
class BriefVoiceStore(private val root: File) {
    private fun child(name: String): File {
        require(name.matches(NAME) && name != "." && name != "..")
        val file = File(root, name)
        require(!Files.isSymbolicLink(file.toPath()))
        require(file.canonicalFile.parentFile == root.canonicalFile)
        return file
    }

    fun directory(pack: VoicePackage): File = child(pack.id)

    fun installed(pack: VoicePackage): Boolean = runCatching {
        val dir = directory(pack)
        val receipt = File(dir, RECEIPT)
        receipt.isFile && receipt.readText() == pack.sha256 && pack.required.all { name ->
            val file = File(dir, name)
            file.canonicalPath.startsWith(dir.canonicalPath + File.separator) && present(file)
        }
    }.getOrDefault(false)

    fun bytes(pack: VoicePackage): Long {
        val dir = directory(pack)
        if (!dir.exists()) return 0
        var total = 0L
        Files.walkFileTree(dir.toPath(), object : SimpleFileVisitor<Path>() {
            override fun visitFile(file: Path, attrs: BasicFileAttributes): FileVisitResult {
                total += attrs.size()
                return FileVisitResult.CONTINUE
            }
        })
        return total
    }

    fun remove(pack: VoicePackage) {
        delete(child(pack.id))
        cleanInterrupted(pack)
    }

    fun cleanInterrupted(pack: VoicePackage) {
        delete(child(pack.id + ".part"))
        delete(child(pack.id + ".staging"))
    }

    /** Écrit puis déplace la voix ; [checkActive] lève pour interrompre, [progress] reçoit les octets lus. */
    fun install(pack: VoicePackage, input: InputStream, checkActive: () -> Unit = {}, progress: (Long) -> Unit = {}) {
        check(root.isDirectory || root.mkdirs()) { "Impossible de créer le dossier des voix" }
        if (installed(pack)) return
        cleanInterrupted(pack)
        val part = child(pack.id + ".part")
        val staging = child(pack.id + ".staging")
        try {
            val digest = MessageDigest.getInstance("SHA-256")
            var count = 0L
            val buffer = ByteArray(BUFFER)
            part.outputStream().use { output ->
                while (true) {
                    checkActive()
                    val n = input.read(buffer)
                    if (n < 0) break
                    count += n
                    require(count <= pack.bytes) { "Téléchargement trop volumineux" }
                    digest.update(buffer, 0, n)
                    output.write(buffer, 0, n)
                    progress(count)
                }
            }
            val hash = digest.digest().joinToString("") { "%02x".format(it) }
            require(count == pack.bytes && hash == pack.sha256) { "Téléchargement incomplet ou corrompu ; réessayez" }
            check(staging.mkdir())
            extract(pack, part, staging, checkActive, buffer)
            require(pack.required.all { present(File(staging, it)) }) { "Fichiers de la voix manquants" }
            checkActive()
            File(staging, RECEIPT).writeText(pack.sha256)
            delete(directory(pack))
            Files.move(staging.toPath(), directory(pack).toPath())
        } finally {
            delete(part)
            delete(staging)
        }
    }

    private fun extract(pack: VoicePackage, archive: File, staging: File, checkActive: () -> Unit, buffer: ByteArray) {
        var expanded = 0L
        var entries = 0
        TarArchiveInputStream(BZip2CompressorInputStream(archive.inputStream().buffered())).use { tar ->
            while (true) {
                checkActive()
                val entry = tar.nextEntry ?: break
                require(++entries <= MAX_ENTRIES && !entry.isSymbolicLink && !entry.isLink && (entry.isDirectory || entry.isFile)) {
                    "Archive non prise en charge"
                }
                val name = entry.name.trimEnd('/')
                require(!name.contains('\\') && !name.startsWith('/') && name.split('/').none { it == ".." || it == "." }) {
                    "Chemin d’archive interdit"
                }
                if (name == pack.archiveRoot && entry.isDirectory) continue
                require(name.startsWith(pack.archiveRoot + "/")) { "Archive inattendue" }
                val target = File(staging, name.removePrefix(pack.archiveRoot + "/"))
                require(target.canonicalPath.startsWith(staging.canonicalPath + File.separator)) { "Chemin d’archive interdit" }
                if (entry.isDirectory) {
                    check(target.isDirectory || target.mkdirs())
                    continue
                }
                expanded += entry.size
                require(entry.size >= 0 && expanded <= pack.maxExpandedBytes) { "Archive décompressée trop volumineuse" }
                check(target.parentFile!!.isDirectory || target.parentFile!!.mkdirs())
                require(!target.exists()) { "Entrée d’archive dupliquée" }
                var written = 0L
                target.outputStream().use { output ->
                    while (true) {
                        checkActive()
                        val n = tar.read(buffer)
                        if (n < 0) break
                        written += n
                        require(written <= entry.size)
                        output.write(buffer, 0, n)
                    }
                }
                require(written == entry.size) { "Archive tronquée" }
            }
        }
    }

    private fun present(file: File): Boolean = (file.isFile && file.length() > 0) || (file.isDirectory && !file.list().isNullOrEmpty())

    private fun delete(file: File) {
        require(file.canonicalFile.parentFile == root.canonicalFile)
        if (!file.exists()) return
        Files.walkFileTree(file.toPath(), object : SimpleFileVisitor<Path>() {
            override fun visitFile(path: Path, attrs: BasicFileAttributes): FileVisitResult {
                Files.delete(path)
                return FileVisitResult.CONTINUE
            }

            override fun postVisitDirectory(dir: Path, error: IOException?): FileVisitResult {
                if (error != null) throw error
                Files.delete(dir)
                return FileVisitResult.CONTINUE
            }
        })
    }

    private companion object {
        const val RECEIPT = ".installed"
        const val BUFFER = 65_536
        const val MAX_ENTRIES = 5_000
        val NAME = Regex("[a-zA-Z0-9_.-]+")
    }
}
