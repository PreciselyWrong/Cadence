package ch.nicolab.cadence.tasks.brief.audio

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.job
import kotlinx.coroutines.launch

/** Téléchargement d'une voix en cours : laquelle, où il en est (0 à 1), et la dernière raison d'échec. */
data class VoiceInstallState(val downloadingId: String? = null, val progress: Float = 0f, val message: String? = null)

/**
 * Télécharge et installe une voix (une seule à la fois), pour la page des réglages comme pour la feuille d'« Écouter » :
 * même vérification, même progression, même annulation. Rien ne part sans appel explicite à [download].
 */
class BriefVoiceInstaller(
    private val store: BriefVoiceStore,
    private val scope: CoroutineScope,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val fetch: (BriefVoice, BriefVoiceStore, () -> Unit, (Long) -> Unit) -> Unit = { voice, target, check, progress ->
        BriefVoiceDownload.fetch(voice, target, check, progress)
    },
    private val failure: (Exception) -> String = BriefVoiceDownload::failureMessage,
) {
    private val _state = MutableStateFlow(VoiceInstallState())
    val state: StateFlow<VoiceInstallState> = _state.asStateFlow()
    private var job: Job? = null

    /** Lance le téléchargement de [voice] ; [onInstalled] suit une installation réussie, [onSettled] suit tout arrêt. */
    fun download(voice: BriefVoice, onInstalled: () -> Unit = {}, onSettled: () -> Unit = {}) {
        if (job?.isActive == true) return
        _state.value = VoiceInstallState(downloadingId = voice.id)
        job = scope.launch(dispatcher) {
            val self = coroutineContext.job
            var lastPercent = -1
            try {
                fetch(voice, store, { self.ensureActive() }) { bytes ->
                    val percent = (bytes * PERCENT / voice.pack.bytes).toInt().coerceIn(0, PERCENT.toInt())
                    if (percent != lastPercent) {
                        lastPercent = percent
                        _state.update { it.copy(progress = percent / PERCENT.toFloat()) }
                    }
                }
                onInstalled()
            } catch (error: CancellationException) {
                store.cleanInterrupted(voice.pack)
                throw error
            } catch (error: Exception) {
                store.cleanInterrupted(voice.pack)
                _state.update { it.copy(message = failure(error)) }
            } finally {
                _state.update { it.copy(downloadingId = null, progress = 0f) }
                onSettled()
            }
        }
    }

    fun cancel() {
        job?.cancel()
    }

    fun clearMessage() {
        _state.update { it.copy(message = null) }
    }

    private companion object {
        const val PERCENT = 100L
    }
}
