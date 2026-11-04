package ch.nicolab.cadence.tasks.brief.audio

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import ch.nicolab.cadence.tasks.brief.ScriptChapterDto
import java.util.Locale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** État de la lecture par la voix du système. [failed] : la voix française du système manque ou n'a pas démarré. */
data class SpeakerState(val speaking: Boolean = false, val chapter: Int = 0, val failed: Boolean = false, val loaded: Boolean = false)

/**
 * Dernier recours quand ni le rendu local ni le MP3 du serveur n'existent : la voix du système lit les chapitres de
 * `audio_script`, un à la fois. Pas de session média (pas de commandes d'écran verrouillé) : la lecture suit l'écran du
 * résumé et s'arrête avec lui. Appelé depuis le thread principal.
 */
class BriefSpeaker(context: Context) {
    private val appContext = context.applicationContext
    private val main = Handler(Looper.getMainLooper())
    private var tts: TextToSpeech? = null
    private var ready = false
    private var pending: (() -> Unit)? = null
    private var chapters: List<ScriptChapterDto> = emptyList()
    private var speed = 1f

    private val _state = MutableStateFlow(SpeakerState())
    val state: StateFlow<SpeakerState> = _state.asStateFlow()

    fun start(chapters: List<ScriptChapterDto>, speed: Float, from: Int = 0) {
        this.chapters = chapters.filter { it.text.isNotBlank() }
        this.speed = speed
        if (this.chapters.isEmpty()) return
        _state.value = SpeakerState(speaking = true, chapter = from.coerceIn(0, this.chapters.lastIndex), loaded = true)
        whenReady { speakCurrent() }
    }

    fun pause() {
        tts?.stop()
        _state.value = _state.value.copy(speaking = false)
    }

    fun resume() {
        if (chapters.isEmpty()) return
        _state.value = _state.value.copy(speaking = true)
        whenReady { speakCurrent() }
    }

    fun next() = jump(_state.value.chapter + 1)

    fun previous() = jump(_state.value.chapter - 1)

    fun shutdown() {
        pending = null
        tts?.shutdown()
        tts = null
        ready = false
        _state.value = SpeakerState()
    }

    private fun jump(index: Int) {
        if (chapters.isEmpty()) return
        _state.value = _state.value.copy(chapter = index.coerceIn(0, chapters.lastIndex))
        if (_state.value.speaking) whenReady { speakCurrent() }
    }

    private fun whenReady(action: () -> Unit) {
        if (ready) {
            action()
            return
        }
        pending = action
        if (tts != null) return
        tts = TextToSpeech(appContext) { status ->
            main.post {
                val engine = tts ?: return@post
                val language = if (status == TextToSpeech.SUCCESS) engine.setLanguage(Locale.FRENCH) else TextToSpeech.ERROR
                if (language == TextToSpeech.LANG_MISSING_DATA || language == TextToSpeech.LANG_NOT_SUPPORTED || language == TextToSpeech.ERROR) {
                    _state.value = _state.value.copy(speaking = false, failed = true)
                    return@post
                }
                engine.setOnUtteranceProgressListener(listener)
                ready = true
                pending?.invoke()
                pending = null
            }
        }
    }

    private fun speakCurrent() {
        val engine = tts ?: return
        val index = _state.value.chapter
        val chapter = chapters.getOrNull(index) ?: return
        engine.setSpeechRate(speed)
        engine.speak(chapter.text, TextToSpeech.QUEUE_FLUSH, null, "$UTTERANCE$index")
    }

    private val listener = object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) = Unit

        override fun onDone(utteranceId: String?) {
            main.post {
                val state = _state.value
                if (!state.speaking || utteranceId != "$UTTERANCE${state.chapter}") return@post
                if (state.chapter < chapters.lastIndex) {
                    _state.value = state.copy(chapter = state.chapter + 1)
                    speakCurrent()
                } else {
                    _state.value = state.copy(speaking = false, chapter = 0)
                }
            }
        }

        @Deprecated("Deprecated in Java")
        override fun onError(utteranceId: String?) {
            main.post { _state.value = _state.value.copy(speaking = false) }
        }
    }

    private companion object {
        const val UTTERANCE = "brief-chapter-"
    }
}
