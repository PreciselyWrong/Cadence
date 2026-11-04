package ch.nicolab.cadence.tasks.brief.audio

import android.content.Context
import android.util.Log
import ch.nicolab.cadence.tasks.brief.BriefRepository
import ch.nicolab.cadence.tasks.brief.EveningRepository
import ch.nicolab.cadence.tasks.brief.audioTarget
import java.io.File
import java.time.LocalDate
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.isActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Audio du résumé et du bilan du soir sur l'appareil : fichiers gardés, voix installées, rendu local et copie du MP3 du
 * serveur. Un seul exemplaire par processus (voir `TasksRuntime`). Le texte du script n'est donné qu'au moteur local.
 */
class BriefAudio internal constructor(
    context: Context,
    private val brief: BriefRepository,
    private val evening: EveningRepository,
    private val download: suspend (path: String, target: File, maxBytes: Long) -> Unit,
) {
    private val appContext = context.applicationContext
    val files = BriefAudioFiles(File(appContext.filesDir, "brief-audio"))
    val voices = BriefVoiceStore(File(appContext.filesDir, "brief-voices"))
    val prefs: BriefAudioPrefs = BriefAudioPrefs.of(appContext)

    /** Sérialise le moteur natif, l'installation finale et la suppression d'une voix. */
    val voiceLock = Mutex()

    private val renderer = BriefAudioRenderer(files, voices) { BriefVoiceEngine.factory?.invoke() }

    /** Voix qui lira : la voix choisie si elle est installée, sinon une autre voix installée, sinon aucune. */
    fun activeVoice(): BriefVoice? {
        val chosen = BriefVoiceCatalog.resolve(prefs.voiceId.value)
        if (voices.installed(chosen.pack)) return chosen
        return BriefVoiceCatalog.voices.firstOrNull { voices.installed(it.pack) }
    }

    /** Source et durée annoncées pour [target], d'après les fichiers déjà là et la voix installée. */
    fun choose(target: AudioTarget?): AudioChoice {
        target ?: return AudioChoice(AudioSource.NONE, null)
        val stored = files.find(target.date, target.version)
        return BriefAudioPlan.choose(
            local = stored?.takeIf { it.origin == AudioOrigin.LOCAL },
            serverCopy = stored?.takeIf { it.origin == AudioOrigin.SERVER },
            audio = target.server,
            scriptWords = BriefAudioPlan.words(target.script),
            voiceReady = activeVoice() != null,
            engineAvailable = BriefVoiceEngine.available,
        )
    }

    /** Corps du travail de fond : ménage, puis rendu local ou copie du MP3 du serveur. Hors ligne, seul le ménage a lieu. */
    suspend fun prepare(active: () -> Boolean) {
        val targets = listOfNotNull(brief.cachedToday()?.audioTarget(), evening.cachedToday()?.audioTarget())
        files.purge(LocalDate.now(), keep = targets.mapTo(HashSet()) { it.date to it.version })
        prefs.prunePositions(files.keys())
        targets.forEach { prepare(it, active) }
    }

    private suspend fun prepare(target: AudioTarget, active: () -> Boolean) {
        val voice = activeVoice()
        val words = BriefAudioPlan.words(target.script)
        fun step(localFailed: Boolean) = BriefAudioPlan.nextStep(
            stored = files.find(target.date, target.version),
            voiceReady = voice != null,
            engineAvailable = BriefVoiceEngine.available,
            voiceId = voice?.id.orEmpty(),
            speed = prefs.speed.value,
            scriptWords = words,
            audio = target.server,
            localFailed = localFailed,
        )
        var next = step(localFailed = false)
        if (next == PrepareStep.RENDER_LOCAL && voice != null) {
            try {
                withContext(Dispatchers.Default) { renderLocked(target, voice, active) }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                Log.w(TAG, "Brief audio render failed", error)
                next = step(localFailed = true)
            }
            if (next == PrepareStep.RENDER_LOCAL) next = PrepareStep.NOTHING
        }
        if (next == PrepareStep.DOWNLOAD_SERVER) ensureServerCopy(target)
    }

    /**
     * Rend [target] tout de suite, avec la voix installée (« Écouter » sans fichier prêt). Un rendu à jour fait entre-temps
     * par le travail de fond est repris tel quel. Null sans voix, sans moteur, sans script ou en cas d'échec.
     */
    suspend fun renderNow(target: AudioTarget): StoredAudio? {
        val voice = activeVoice() ?: return null
        if (!BriefVoiceEngine.available || BriefAudioPlan.words(target.script) == 0) return null
        return try {
            withContext(Dispatchers.Default) { renderLocked(target, voice) { isActive } }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Log.w(TAG, "Brief audio render failed", error)
            null
        }
    }

    private suspend fun renderLocked(target: AudioTarget, voice: BriefVoice, active: () -> Boolean): StoredAudio? =
        voiceLock.withLock {
            val speed = prefs.speed.value
            files.find(target.date, target.version)?.takeIf { BriefAudioPlan.isCurrent(it, voice.id, speed) }
                ?: renderer.render(target.date, target.version, target.script?.chapters.orEmpty(), voice, speed, active)
        }

    /** Copie le MP3 du serveur (clé API de l'appareil) si le brief le dit prêt ; null hors ligne ou en cas d'échec. */
    suspend fun ensureServerCopy(target: AudioTarget): StoredAudio? {
        files.find(target.date, target.version)?.let { return it }
        if (!BriefAudioPlan.serverReady(target.server)) return null
        return try {
            val part = files.partFile(target.date, target.version, AudioOrigin.SERVER)
            files.directory()
            download("/api/v1/daily-plan/${target.date}/brief/audio", part, MAX_SERVER_BYTES)
            val titles = target.script?.chapters.orEmpty().associate { it.id to it.title }
            val audio = target.server
            val marks = audio?.chapters.orEmpty().map { ChapterMarkJson(it.id, titles[it.id].orEmpty(), (it.startSeconds * 1000).toLong()) }
            val duration = ((audio?.durationSeconds ?: 0.0) * 1000).toLong()
            files.commit(target.date, target.version, AudioOrigin.SERVER, part, BriefAudioMeta(duration, marks))
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Log.w(TAG, "Brief server audio download failed", error)
            null
        }
    }

    private companion object {
        const val TAG = "BriefAudio"
        const val MAX_SERVER_BYTES = 40L * 1024 * 1024
    }
}
