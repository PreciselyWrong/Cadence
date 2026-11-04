package ch.nicolab.cadence.tasks.ui.settings

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.brief.audio.BriefAudioScheduler
import ch.nicolab.cadence.tasks.brief.audio.BriefVoice
import ch.nicolab.cadence.tasks.brief.audio.BriefVoiceCatalog
import ch.nicolab.cadence.tasks.brief.audio.BriefVoiceInstaller
import ch.nicolab.cadence.tasks.brief.audio.BriefVoiceEngine
import ch.nicolab.cadence.tasks.brief.audio.VoicePreview
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/** Une voix du catalogue et ce que le téléphone en garde. */
internal data class VoiceRow(val voice: BriefVoice, val installed: Boolean, val bytes: Long)

internal data class VoiceUiState(
    val rows: List<VoiceRow> = emptyList(),
    val selectedId: String = BriefVoiceCatalog.DEFAULT_ID,
    val speed: Float = 1f,
    /** Voix en cours de téléchargement et sa progression (0 à 1). */
    val downloadingId: String? = null,
    val progress: Float = 0f,
    val previewing: Boolean = false,
    val message: String? = null,
    val storageBytes: Long = 0,
)

/**
 * Réglages de la voix de ce téléphone : choix, téléchargement avec vérification, suppression, vitesse, extrait. Rien
 * n'est téléchargé ni généré avant une action de la personne.
 */
internal class BriefVoiceViewModel(application: Application) : AndroidViewModel(application) {
    private val audio = TasksGraph.briefAudio(application)
    private val prefs = audio.prefs
    private val preview = VoicePreview()
    private val local = MutableStateFlow(VoiceUiState())
    private val installer = BriefVoiceInstaller(audio.voices, viewModelScope)

    val state: StateFlow<VoiceUiState> = combine(local, prefs.voiceId, prefs.speed, installer.state) { current, voice, speed, install ->
        current.copy(
            selectedId = BriefVoiceCatalog.resolve(voice).id,
            speed = speed,
            downloadingId = install.downloadingId,
            progress = install.progress,
            message = install.message ?: current.message,
        )
    }.stateIn(viewModelScope, SharingStarted.Eagerly, VoiceUiState())

    init {
        reload()
    }

    fun select(voice: BriefVoice) {
        prefs.setVoice(voice.id)
        BriefAudioScheduler.request(getApplication())
    }

    fun setSpeed(speed: Float) {
        prefs.setSpeed(speed)
        BriefAudioScheduler.request(getApplication())
    }

    fun download(voice: BriefVoice) {
        local.update { it.copy(message = null) }
        installer.clearMessage()
        installer.download(
            voice,
            onInstalled = {
                prefs.setVoice(voice.id)
                BriefAudioScheduler.request(getApplication())
            },
            onSettled = ::reload,
        )
    }

    fun cancelDownload() = installer.cancel()

    fun delete(voice: BriefVoice) {
        viewModelScope.launch(Dispatchers.IO) {
            audio.voiceLock.withLock {
                audio.voices.remove(voice.pack)
                audio.files.deleteRenderedWith(voice.id)
            }
            reload()
        }
    }

    fun preview(voice: BriefVoice) {
        val factory = BriefVoiceEngine.factory
        if (factory == null) {
            local.update { it.copy(message = getApplication<Application>().getString(R.string.brief_voice_engine_missing)) }
            return
        }
        if (local.value.previewing) return
        local.update { it.copy(previewing = true, message = null) }
        viewModelScope.launch {
            val text = getApplication<Application>().getString(R.string.brief_voice_preview_text)
            val clip = withContext(Dispatchers.Default) {
                runCatching {
                    audio.voiceLock.withLock {
                        factory().use { it.synthesize(voice, audio.voices.directory(voice.pack), text, prefs.speed.value) { true } }
                    }
                }
            }
            clip.onSuccess { preview.play(it) }.onFailure {
                local.update { state -> state.copy(message = getApplication<Application>().getString(R.string.brief_voice_preview_failed)) }
            }
            local.update { it.copy(previewing = false) }
        }
    }

    private fun reload() {
        viewModelScope.launch(Dispatchers.IO) {
            val rows = BriefVoiceCatalog.voices.map { voice ->
                VoiceRow(voice, audio.voices.installed(voice.pack), audio.voices.bytes(voice.pack))
            }
            val files = audio.files.directory().listFiles().orEmpty().sumOf { it.length() }
            local.update { it.copy(rows = rows, storageBytes = rows.sumOf { row -> row.bytes } + files) }
        }
    }

    override fun onCleared() {
        preview.stop()
        super.onCleared()
    }
}
