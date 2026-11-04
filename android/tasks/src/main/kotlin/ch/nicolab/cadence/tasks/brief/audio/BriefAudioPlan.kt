package ch.nicolab.cadence.tasks.brief.audio

import ch.nicolab.cadence.tasks.brief.AudioDto
import ch.nicolab.cadence.tasks.brief.AudioScriptDto
import kotlin.math.ceil
import kotlin.math.roundToInt

/**
 * D'où vient le son : fichier rendu sur le téléphone, MP3 du serveur, rendu local à faire à l'appui ([RENDER], une voix
 * est installée), voix à télécharger d'abord ([GET_VOICE]), ou rien.
 */
enum class AudioSource { LOCAL, SERVER, RENDER, GET_VOICE, NONE }

/** Ce qui se lit : le résumé du matin ou le bilan du soir, avec son script et, pour le matin, l'audio du serveur. */
data class AudioTarget(
    val date: java.time.LocalDate,
    val version: Int,
    val script: AudioScriptDto?,
    val server: AudioDto? = null,
)

/** La source retenue et la durée annoncée sur le bouton « Écouter · N min ». */
data class AudioChoice(val source: AudioSource, val minutes: Int?)

/** Ce que la préparation en arrière-plan doit faire pour un brief. */
enum class PrepareStep { RENDER_LOCAL, DOWNLOAD_SERVER, NOTHING }

/** Décisions pures : quelle source jouer et quoi préparer. L'ordre est local, puis serveur, puis rendu sur demande. */
object BriefAudioPlan {
    /** Débit de lecture d'un texte français à voix naturelle, pour annoncer la durée d'un rendu pas encore fait. */
    private const val WORDS_PER_MINUTE = 150

    fun words(script: AudioScriptDto?): Int =
        script?.chapters.orEmpty().sumOf { chapter -> chapter.text.trim().split(WHITESPACE).count { it.isNotEmpty() } }

    fun serverReady(audio: AudioDto?): Boolean = audio?.status == "ready"

    fun minutes(durationMs: Long): Int = ceil(durationMs / 60_000.0).toInt().coerceAtLeast(1)

    fun estimateMinutes(words: Int): Int = ceil(words / WORDS_PER_MINUTE.toDouble()).toInt().coerceAtLeast(1)

    /**
     * [local] : le fichier rendu sur le téléphone ; [serverCopy] : la copie déjà téléchargée du MP3 ; [audio] : ce
     * que le brief dit du MP3 du serveur ; [scriptWords] : mots du script audio (0 sans script) ; [voiceReady] : une
     * voix Piper est installée ; [engineAvailable] : le moteur natif est enregistré.
     */
    fun choose(
        local: StoredAudio?,
        serverCopy: StoredAudio?,
        audio: AudioDto?,
        scriptWords: Int,
        voiceReady: Boolean = false,
        engineAvailable: Boolean = true,
    ): AudioChoice = when {
        local != null -> AudioChoice(AudioSource.LOCAL, minutes(local.meta.durationMs))
        serverCopy != null -> AudioChoice(AudioSource.SERVER, minutes(serverCopy.meta.durationMs))
        serverReady(audio) -> AudioChoice(AudioSource.SERVER, audio?.durationSeconds?.let { minutes((it * 1000).roundToInt().toLong()) })
        scriptWords > 0 && engineAvailable && voiceReady -> AudioChoice(AudioSource.RENDER, estimateMinutes(scriptWords))
        scriptWords > 0 && engineAvailable -> AudioChoice(AudioSource.GET_VOICE, estimateMinutes(scriptWords))
        else -> AudioChoice(AudioSource.NONE, null)
    }

    /** Le rendu fait avec d'autres réglages que ceux d'aujourd'hui n'est plus à jour. */
    fun isCurrent(local: StoredAudio?, voiceId: String, speed: Float): Boolean =
        local != null && local.origin == AudioOrigin.LOCAL && local.meta.voice == voiceId && local.meta.speed == speed

    /**
     * Étape de préparation. Une voix installée avec un moteur et un script rend en local ; sinon le MP3 prêt du
     * serveur est copié pour la lecture hors ligne. [localFailed] : le rendu local vient d'échouer, le serveur prend la suite.
     */
    fun nextStep(
        stored: StoredAudio?,
        voiceReady: Boolean,
        engineAvailable: Boolean,
        voiceId: String,
        speed: Float,
        scriptWords: Int,
        audio: AudioDto?,
        localFailed: Boolean = false,
    ): PrepareStep {
        val canRender = voiceReady && engineAvailable && scriptWords > 0 && !localFailed
        return when {
            canRender && !isCurrent(stored, voiceId, speed) -> PrepareStep.RENDER_LOCAL
            canRender -> PrepareStep.NOTHING
            stored != null -> PrepareStep.NOTHING
            serverReady(audio) -> PrepareStep.DOWNLOAD_SERVER
            else -> PrepareStep.NOTHING
        }
    }

    private val WHITESPACE = Regex("\\s+")
}
