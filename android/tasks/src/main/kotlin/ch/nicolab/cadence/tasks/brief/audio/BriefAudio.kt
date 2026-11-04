package ch.nicolab.cadence.tasks.brief.audio

import android.content.Context
import android.util.Log
import ch.nicolab.cadence.tasks.brief.BriefRepository
import ch.nicolab.cadence.tasks.brief.CachedBrief
import java.io.File
import java.time.LocalDate
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Audio du résumé sur l'appareil : fichiers gardés, voix installées, rendu local et copie du MP3 du serveur. Un seul
 * exemplaire par processus (voir `TasksRuntime`). Le texte du script n'est donné qu'au moteur local.
 */
class BriefAudio internal constructor(
    context: Context,
    private val brief: BriefRepository,
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

    /** Source et durée annoncées pour ce brief, d'après les fichiers déjà là. */
    fun choose(cached: CachedBrief): AudioChoice {
        val dto = cached.brief ?: return AudioChoice(AudioSource.NONE, null)
        val stored = files.find(cached.date, cached.version)
        return BriefAudioPlan.choose(
            local = stored?.takeIf { it.origin == AudioOrigin.LOCAL },
            serverCopy = stored?.takeIf { it.origin == AudioOrigin.SERVER },
            audio = dto.audio,
            scriptWords = BriefAudioPlan.words(dto.audioScript),
        )
    }

    /** Corps du travail de fond : ménage, puis rendu local ou copie du MP3 du serveur. Hors ligne, seul le ménage a lieu. */
    suspend fun prepare(active: () -> Boolean) {
        val cached = brief.cachedToday()
        val dto = cached?.brief
        files.purge(LocalDate.now(), keep = cached?.takeIf { dto != null }?.let { it.date to it.version })
        prefs.prunePositions(files.keys())
        if (cached == null || dto == null) return

        val voice = activeVoice()
        val words = BriefAudioPlan.words(dto.audioScript)
        fun step(localFailed: Boolean) = BriefAudioPlan.nextStep(
            stored = files.find(cached.date, cached.version),
            voiceReady = voice != null,
            engineAvailable = BriefVoiceEngine.available,
            voiceId = voice?.id.orEmpty(),
            speed = prefs.speed.value,
            scriptWords = words,
            audio = dto.audio,
            localFailed = localFailed,
        )
        var next = step(localFailed = false)
        if (next == PrepareStep.RENDER_LOCAL && voice != null) {
            try {
                withContext(Dispatchers.Default) {
                    voiceLock.withLock {
                        renderer.render(cached.date, cached.version, dto.audioScript?.chapters.orEmpty(), voice, prefs.speed.value, active)
                    }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                Log.w(TAG, "Brief audio render failed", error)
                next = step(localFailed = true)
            }
            if (next == PrepareStep.RENDER_LOCAL) next = PrepareStep.NOTHING
        }
        if (next == PrepareStep.DOWNLOAD_SERVER) ensureServerCopy(cached)
    }

    /** Copie le MP3 du serveur (clé API de l'appareil) si le brief le dit prêt ; null hors ligne ou en cas d'échec. */
    suspend fun ensureServerCopy(cached: CachedBrief): StoredAudio? {
        val dto = cached.brief ?: return null
        files.find(cached.date, cached.version)?.let { return it }
        if (!BriefAudioPlan.serverReady(dto.audio)) return null
        return try {
            val part = files.partFile(cached.date, cached.version, AudioOrigin.SERVER)
            files.directory()
            download("/api/v1/daily-plan/${cached.date}/brief/audio", part, MAX_SERVER_BYTES)
            val titles = dto.audioScript?.chapters.orEmpty().associate { it.id to it.title }
            val audio = dto.audio
            val marks = audio?.chapters.orEmpty().map { ChapterMarkJson(it.id, titles[it.id].orEmpty(), (it.startSeconds * 1000).toLong()) }
            val duration = ((audio?.durationSeconds ?: 0.0) * 1000).toLong()
            files.commit(cached.date, cached.version, AudioOrigin.SERVER, part, BriefAudioMeta(duration, marks))
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
