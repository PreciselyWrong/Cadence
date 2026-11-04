package ch.nicolab.cadence.tasks.brief.audio

import ch.nicolab.cadence.tasks.brief.ScriptChapterDto
import java.time.LocalDate
import kotlinx.coroutines.CancellationException

/**
 * Rend l'audio du brief sur le téléphone : un chapitre après l'autre par la voix locale, assemblés avec 0,8 s de
 * silence, écrits en WAV (mono 16 bits : pas d'encodeur à gérer, positions exactes, ~2,6 Mo par minute à 22 kHz, soit
 * moins de 40 Mo pour sept jours). Le texte ne quitte jamais l'appareil.
 */
class BriefAudioRenderer(
    private val files: BriefAudioFiles,
    private val voices: BriefVoiceStore,
    private val engine: () -> VoiceSynthesizer?,
) {
    /** Rend la version [version] de [date] ; null quand rien n'est à lire. [active] faux interrompt (CancellationException). */
    fun render(
        date: LocalDate,
        version: Int,
        chapters: List<ScriptChapterDto>,
        voice: BriefVoice,
        speed: Float,
        active: () -> Boolean,
    ): StoredAudio? {
        val spoken = chapters.filter { it.text.isNotBlank() }
        if (spoken.isEmpty()) return null
        val synthesizer = checkNotNull(engine()) { "Moteur de voix indisponible" }
        files.directory()
        val part = files.partFile(date, version, AudioOrigin.LOCAL)
        try {
            synthesizer.use { engineInUse ->
                val directory = voices.directory(voice.pack)
                var rate = 0
                val clips = spoken.map { chapter ->
                    if (!active()) throw CancellationException()
                    val clip = engineInUse.synthesize(voice, directory, chapter.text.trim(), speed, active)
                    if (rate == 0) rate = clip.sampleRate
                    check(clip.sampleRate == rate) { "Fréquences d'échantillonnage différentes" }
                    check(clip.samples.isNotEmpty() && clip.samples.all { it.isFinite() }) { "Le moteur n'a pas produit d'audio valide" }
                    ChapterClip(chapter.id, chapter.title, BriefAudioMath.toPcm16(clip.samples))
                }
                if (!active()) throw CancellationException()
                val joined = BriefAudioMath.join(clips, rate)
                BriefAudioMath.writeWav(part, joined.samples, joined.sampleRate)
                val meta = BriefAudioMeta(
                    durationMs = joined.durationMs,
                    chapters = joined.chapters.map { ChapterMarkJson(it.id, it.title, it.startMs) },
                    voice = voice.id,
                    speed = speed,
                )
                return files.commit(date, version, AudioOrigin.LOCAL, part, meta)
            }
        } finally {
            part.delete()
        }
    }
}
