package ch.nicolab.cadence.voice

import ch.nicolab.cadence.tasks.brief.audio.BriefVoice
import ch.nicolab.cadence.tasks.brief.audio.PcmClip
import ch.nicolab.cadence.tasks.brief.audio.VoiceSynthesizer
import com.k2fsa.sherpa.onnx.GenerationConfig
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import java.io.File
import kotlinx.coroutines.CancellationException

/**
 * Voix Piper par Sherpa-ONNX (ONNX Runtime, CPU), adaptée de SonOhé. Un exemplaire charge un modèle à la demande et
 * le libère à la fermeture ; l'appelant le garde sous verrou pour toute la durée du rendu.
 */
class SherpaVoiceSynthesizer : VoiceSynthesizer {
    private var engine: OfflineTts? = null
    private var loadedId: String? = null

    override fun synthesize(voice: BriefVoice, voiceDir: File, text: String, speed: Float, active: () -> Boolean): PcmClip {
        require(text.isNotBlank()) { "Texte vide" }
        if (!active()) throw CancellationException()
        if (loadedId != voice.id) {
            release()
            fun path(name: String) = File(voiceDir, name).absolutePath
            val model = OfflineTtsModelConfig(numThreads = THREADS, debug = false, provider = "cpu")
            model.vits = OfflineTtsVitsModelConfig(model = path(voice.modelFile), tokens = path("tokens.txt"), dataDir = path("espeak-ng-data"))
            engine = OfflineTts(config = OfflineTtsConfig(model = model))
            loadedId = voice.id
        }
        val native = checkNotNull(engine)
        require(native.numSpeakers() > 0) { "Voix indisponible dans ce modèle" }
        val config = GenerationConfig(sid = 0, speed = speed, extra = mapOf("lang" to "fr"))
        val result = native.generateWithConfigAndCallback(text, config, NativeAudioCallback(active))
        if (!active()) throw CancellationException()
        return PcmClip(result.sampleRate, result.samples)
    }

    override fun close() = release()

    private fun release() {
        engine?.release()
        engine = null
        loadedId = null
    }

    private companion object {
        const val THREADS = 4
    }
}

/**
 * Le JNI de Sherpa cherche `invoke(float[]) -> Integer` : une lambda (invokedynamic) n'expose que `invoke(Object)`,
 * d'où une classe. 1 continue, 0 interrompt la génération.
 */
internal class NativeAudioCallback(private val active: () -> Boolean) : (FloatArray) -> Int {
    override fun invoke(samples: FloatArray): Int = if (active()) 1 else 0
}
