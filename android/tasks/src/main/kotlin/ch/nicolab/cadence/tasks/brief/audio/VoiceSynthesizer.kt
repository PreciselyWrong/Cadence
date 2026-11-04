package ch.nicolab.cadence.tasks.brief.audio

import java.io.File

/** Audio mono produit par le moteur : échantillons flottants de -1 à 1. */
class PcmClip(val sampleRate: Int, val samples: FloatArray)

/**
 * Moteur de voix locale. L'implémentation native (Sherpa-ONNX) vit dans `:app` ; `:tasks` et ses tests ne chargent
 * jamais de bibliothèque native. [synthesize] bloque : l'appelant l'exécute hors du thread principal, [active] rend
 * faux pour interrompre.
 */
interface VoiceSynthesizer : AutoCloseable {
    fun synthesize(voice: BriefVoice, voiceDir: File, text: String, speed: Float, active: () -> Boolean): PcmClip
}

/** Point d'enregistrement du moteur : `CadenceApp` y pose la fabrique ; sans elle, aucune voix locale ne se génère. */
object BriefVoiceEngine {
    @Volatile
    var factory: (() -> VoiceSynthesizer)? = null

    val available: Boolean get() = factory != null
}
