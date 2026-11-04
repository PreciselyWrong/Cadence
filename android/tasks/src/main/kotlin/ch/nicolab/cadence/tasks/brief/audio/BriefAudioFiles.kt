package ch.nicolab.cadence.tasks.brief.audio

import java.io.File
import java.time.LocalDate
import java.time.format.DateTimeParseException
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/** Origine d'un fichier gardé : rendu sur le téléphone ou copie du MP3 du serveur. */
enum class AudioOrigin(val extension: String) {
    LOCAL("wav"),
    SERVER("mp3"),
}

@Serializable
data class ChapterMarkJson(val id: String, val title: String, val startMs: Long)

/** Fiche à côté de chaque fichier : durée, décalages des chapitres et réglages qui l'ont produit. */
@Serializable
data class BriefAudioMeta(
    val durationMs: Long,
    val chapters: List<ChapterMarkJson>,
    val voice: String? = null,
    val speed: Float? = null,
) {
    fun marks(): List<ChapterMark> = chapters.map { ChapterMark(it.id, it.title, it.startMs) }
}

/** Un fichier audio de brief prêt à jouer. */
data class StoredAudio(
    val date: LocalDate,
    val version: Int,
    val origin: AudioOrigin,
    val file: File,
    val meta: BriefAudioMeta,
) {
    val key: String get() = BriefAudioFiles.key(date, version)
}

/**
 * Fichiers audio du résumé dans les fichiers de l'application : `<date>-v<version>.wav` (rendu local) ou `.mp3`
 * (serveur) avec sa fiche `.json`. Un seul fichier par date et version ; tout est effacé après [RETENTION_DAYS] jours.
 */
class BriefAudioFiles(private val root: File) {
    private val json = Json { ignoreUnknownKeys = true }

    fun audioFile(date: LocalDate, version: Int, origin: AudioOrigin): File = File(root, "${key(date, version)}.${origin.extension}")

    fun metaFile(date: LocalDate, version: Int): File = File(root, "${key(date, version)}.json")

    fun partFile(date: LocalDate, version: Int, origin: AudioOrigin): File = File(root, "${key(date, version)}.${origin.extension}.part")

    fun directory(): File = root.apply { mkdirs() }

    /** Le fichier de cette version : le rendu local d'abord, sinon la copie du serveur. */
    fun find(date: LocalDate, version: Int): StoredAudio? {
        val meta = readMeta(metaFile(date, version)) ?: return null
        return AudioOrigin.entries
            .map { it to audioFile(date, version, it) }
            .firstOrNull { (_, file) -> file.isFile && file.length() > 0 }
            ?.let { (origin, file) -> StoredAudio(date, version, origin, file, meta) }
    }

    /** Résout `<date>-v<version>` (identifiant de média du lecteur) ; null si le fichier n'existe plus. */
    fun findByKey(key: String): StoredAudio? {
        val (date, version) = parseKey(key) ?: return null
        return find(date, version)
    }

    /** Publie un fichier terminé : la fiche s'écrit en dernier, elle marque la version comme prête. */
    fun commit(date: LocalDate, version: Int, origin: AudioOrigin, part: File, meta: BriefAudioMeta): StoredAudio {
        val target = audioFile(date, version, origin)
        check(part.renameTo(target)) { "Impossible de publier le fichier audio" }
        // La fiche décrit ce fichier-ci : l'autre origine, avec d'autres décalages, ne doit plus l'accompagner.
        AudioOrigin.entries.filter { it != origin }.forEach { audioFile(date, version, it).delete() }
        val metaFile = metaFile(date, version)
        val temp = File(root, metaFile.name + ".part")
        temp.writeText(json.encodeToString(meta))
        check(temp.renameTo(metaFile)) { "Impossible de publier la fiche audio" }
        return StoredAudio(date, version, origin, target, meta)
    }

    /** Retire les autres versions de [date] et les fichiers de plus de [RETENTION_DAYS] jours ; rend ce qui a été effacé. */
    fun purge(today: LocalDate, keep: Pair<LocalDate, Int>? = null): List<File> {
        val removed = ArrayList<File>()
        root.listFiles().orEmpty().forEach { file ->
            val entry = parseName(file.name)
            val stale = entry == null ||
                entry.date.isBefore(today.minusDays(RETENTION_DAYS.toLong())) ||
                (keep != null && entry.date == keep.first && entry.version != keep.second)
            if (stale && file.delete()) removed += file
        }
        return removed
    }

    /** Efface les rendus locaux faits avec [voiceId] (la voix vient d'être supprimée). */
    fun deleteRenderedWith(voiceId: String): List<File> {
        val removed = ArrayList<File>()
        root.listFiles().orEmpty().filter { it.name.endsWith(".json") }.forEach { metaFile ->
            val meta = readMeta(metaFile) ?: return@forEach
            if (meta.voice != voiceId) return@forEach
            val base = metaFile.name.removeSuffix(".json")
            listOf(metaFile, File(root, "$base.wav")).forEach { if (it.delete()) removed += it }
        }
        return removed
    }

    /** Clés `<date>-v<version>` encore présentes : sert à élaguer les positions de reprise. */
    fun keys(): Set<String> = root.listFiles().orEmpty().mapNotNull { parseName(it.name)?.let { e -> key(e.date, e.version) } }.toSet()

    private fun readMeta(file: File): BriefAudioMeta? =
        if (file.isFile) runCatching { json.decodeFromString<BriefAudioMeta>(file.readText()) }.getOrNull() else null

    private class Entry(val date: LocalDate, val version: Int)

    private fun parseName(name: String): Entry? {
        val match = NAME.matchEntire(name) ?: return null
        return parseKey("${match.groupValues[1]}-v${match.groupValues[2]}")?.let { (date, version) -> Entry(date, version) }
    }

    companion object {
        const val RETENTION_DAYS = 7
        private val NAME = Regex("""(\d{4}-\d{2}-\d{2})-v(\d+)\.(?:wav|mp3|json)(?:\.part)?""")
        private val KEY = Regex("""(\d{4}-\d{2}-\d{2})-v(\d+)""")

        fun key(date: LocalDate, version: Int): String = "$date-v$version"

        fun parseKey(key: String): Pair<LocalDate, Int>? {
            val match = KEY.matchEntire(key) ?: return null
            return try {
                LocalDate.parse(match.groupValues[1]) to (match.groupValues[2].toIntOrNull() ?: return null)
            } catch (_: DateTimeParseException) {
                null
            }
        }
    }
}
