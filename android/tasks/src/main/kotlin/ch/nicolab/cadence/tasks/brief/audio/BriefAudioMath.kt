package ch.nicolab.cadence.tasks.brief.audio

import java.io.DataOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Un chapitre synthétisé, en échantillons 16 bits. */
class ChapterClip(val id: String, val title: String, val samples: ShortArray)

/** Début d'un chapitre dans le fichier rendu, en millisecondes. */
data class ChapterMark(val id: String, val title: String, val startMs: Long)

/** Les chapitres bout à bout, séparés par du silence ; [chapters] garde le début de chacun. */
class JoinedAudio(val samples: ShortArray, val sampleRate: Int, val chapters: List<ChapterMark>) {
    val durationMs: Long get() = BriefAudioMath.millis(samples.size, sampleRate)
}

/** Fonctions pures du rendu : conversion, assemblage, décalages des chapitres, écriture WAV. */
object BriefAudioMath {
    /** Silence entre deux chapitres, comme le rendu du serveur. */
    const val SILENCE_MS = 800

    fun millis(sampleCount: Int, sampleRate: Int): Long = sampleCount.toLong() * 1000L / sampleRate

    fun toPcm16(samples: FloatArray): ShortArray = ShortArray(samples.size) { index ->
        (samples[index].coerceIn(-1f, 1f) * Short.MAX_VALUE).toInt().toShort()
    }

    /** Assemble [clips] dans l'ordre avec [silenceMs] entre eux (pas après le dernier). */
    fun join(clips: List<ChapterClip>, sampleRate: Int, silenceMs: Int = SILENCE_MS): JoinedAudio {
        require(sampleRate > 0) { "Fréquence d'échantillonnage invalide" }
        val silence = (sampleRate.toLong() * silenceMs / 1000L).toInt()
        val total = clips.sumOf { it.samples.size } + silence * (clips.size - 1).coerceAtLeast(0)
        val out = ShortArray(total)
        val marks = ArrayList<ChapterMark>(clips.size)
        var cursor = 0
        clips.forEachIndexed { index, clip ->
            marks += ChapterMark(clip.id, clip.title, millis(cursor, sampleRate))
            clip.samples.copyInto(out, cursor)
            cursor += clip.samples.size
            if (index < clips.lastIndex) cursor += silence
        }
        return JoinedAudio(out, sampleRate, marks)
    }

    /** WAV PCM 16 bits mono ; écrit en flux pour ne pas doubler la mémoire. */
    fun writeWav(file: File, samples: ShortArray, sampleRate: Int) {
        val dataBytes = samples.size * 2
        DataOutputStream(file.outputStream().buffered()).use { out ->
            val header = ByteBuffer.allocate(HEADER_BYTES).order(ByteOrder.LITTLE_ENDIAN)
            header.put("RIFF".toByteArray()).putInt(36 + dataBytes).put("WAVE".toByteArray())
            header.put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(1)
            header.putInt(sampleRate).putInt(sampleRate * 2).putShort(2).putShort(16)
            header.put("data".toByteArray()).putInt(dataBytes)
            out.write(header.array())
            val chunk = ByteBuffer.allocate(CHUNK_SAMPLES * 2).order(ByteOrder.LITTLE_ENDIAN)
            var index = 0
            while (index < samples.size) {
                chunk.clear()
                val end = minOf(samples.size, index + CHUNK_SAMPLES)
                while (index < end) chunk.putShort(samples[index++])
                out.write(chunk.array(), 0, chunk.position())
            }
        }
    }

    private const val HEADER_BYTES = 44
    private const val CHUNK_SAMPLES = 16_384
}

/** Navigation par chapitre sur les décalages d'un fichier. */
object ChapterMarks {
    /** Un « précédent » appuyé après ce délai dans un chapitre revient d'abord à son début. */
    const val RESTART_MS = 3_000L

    /** Rang du chapitre qui contient [positionMs] ; -1 sans chapitre. */
    fun indexAt(marks: List<ChapterMark>, positionMs: Long): Int =
        marks.indexOfLast { it.startMs <= positionMs }.let { if (it < 0 && marks.isNotEmpty()) 0 else it }

    /** Titre de la partie en cours (« Priorités du jour ») ; null sans partie ou sans titre. */
    fun titleAt(marks: List<ChapterMark>, positionMs: Long): String? =
        marks.getOrNull(indexAt(marks, positionMs))?.title?.ifBlank { null }

    fun nextStart(marks: List<ChapterMark>, positionMs: Long): Long? {
        val index = indexAt(marks, positionMs)
        return marks.getOrNull(index + 1)?.startMs
    }

    /** Début du chapitre courant s'il est entamé depuis plus de [RESTART_MS], sinon celui d'avant (ou 0). */
    fun previousStart(marks: List<ChapterMark>, positionMs: Long): Long {
        val index = indexAt(marks, positionMs)
        if (index < 0) return 0L
        val current = marks[index].startMs
        return if (positionMs - current > RESTART_MS || index == 0) current else marks[index - 1].startMs
    }
}
