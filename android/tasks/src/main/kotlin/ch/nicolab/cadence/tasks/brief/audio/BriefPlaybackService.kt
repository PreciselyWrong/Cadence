package ch.nicolab.cadence.tasks.brief.audio

import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.data.TasksRuntime
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * Lecture de l'audio du résumé en arrière-plan : commandes d'écran verrouillé, Bluetooth, notification. Les fichiers
 * viennent de [BriefAudioFiles] ; le contrôleur de l'écran ne donne qu'un identifiant `<date>-v<version>`, jamais un
 * chemin ou une adresse. « Suivant » et « précédent » passent d'un chapitre à l'autre.
 */
class BriefPlaybackService : MediaSessionService() {
    private var session: MediaSession? = null
    private var player: ExoPlayer? = null
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var audio: BriefAudio

    private val saver = object : Runnable {
        override fun run() {
            savePosition()
            handler.postDelayed(this, SAVE_EVERY_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        audio = TasksRuntime.get(applicationContext).briefAudio
        val exo = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build(),
                true,
            )
            .setHandleAudioBecomingNoisy(true)
            .build()
        player = exo
        exo.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                handler.removeCallbacks(saver)
                if (isPlaying) handler.postDelayed(saver, SAVE_EVERY_MS) else savePosition()
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) {
                    exo.currentMediaItem?.mediaId?.let { audio.prefs.savePosition(it, 0L) }
                }
            }
        })
        val provider = DefaultMediaNotificationProvider.Builder(this)
            .setChannelId(CHANNEL_ID)
            .setChannelName(R.string.brief_audio_channel)
            .build()
        provider.setSmallIcon(R.drawable.tasks_ic_notification)
        setMediaNotificationProvider(provider)
        session = MediaSession.Builder(this, ChapterPlayer(exo, audio.files))
            .setId(SESSION_ID)
            .setCallback(Callback())
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Un résumé en pause ne garde pas le service ; en lecture, il continue (écran verrouillé, appli fermée).
        val exo = player
        if (exo == null || !exo.playWhenReady || exo.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        handler.removeCallbacks(saver)
        savePosition()
        session?.release()
        session = null
        player?.release()
        player = null
        super.onDestroy()
    }

    private fun savePosition() {
        val exo = player ?: return
        val id = exo.currentMediaItem?.mediaId ?: return
        if (exo.playbackState == Player.STATE_ENDED) return
        audio.prefs.savePosition(id, exo.currentPosition)
    }

    /** Ne laisse entrer que des identifiants de brief dont le fichier existe : l'URI est reconstruite ici. */
    private inner class Callback : MediaSession.Callback {
        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
        ): ListenableFuture<MutableList<MediaItem>> {
            val resolved = mediaItems.mapNotNull { item -> audio.files.findByKey(item.mediaId)?.let { mediaItemOf(it, getString(R.string.brief_title)) } }
            return Futures.immediateFuture(resolved.toMutableList())
        }
    }

    companion object {
        private const val SESSION_ID = "brief-audio"
        private const val CHANNEL_ID = "brief_audio"
        private const val SAVE_EVERY_MS = 5_000L

        /** Le média du lecteur : identifiant du brief, fichier gardé, titre de la notification. */
        fun mediaItemOf(stored: StoredAudio, title: String): MediaItem = MediaItem.Builder()
            .setMediaId(stored.key)
            .setUri(Uri.fromFile(stored.file))
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(title)
                    .setSubtitle(stored.date.toString())
                    .setIsPlayable(true)
                    .build(),
            )
            .build()
    }
}

/**
 * Lecteur dont « suivant » et « précédent » changent de chapitre. Les décalages se lisent dans la fiche du fichier en
 * cours ; sans fiche, les deux commandes ne font rien.
 */
internal class ChapterPlayer(player: Player, private val files: BriefAudioFiles) : ForwardingPlayer(player) {
    private fun marks(): List<ChapterMark> =
        currentMediaItem?.mediaId?.let { files.findByKey(it) }?.meta?.marks().orEmpty()

    override fun getAvailableCommands(): Player.Commands = super.getAvailableCommands().buildUpon()
        .addAll(Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_PREVIOUS)
        .build()

    override fun isCommandAvailable(command: Int): Boolean = when (command) {
        Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_PREVIOUS -> true
        else -> super.isCommandAvailable(command)
    }

    override fun seekToNext() {
        ChapterMarks.nextStart(marks(), currentPosition)?.let { seekTo(it) }
    }

    override fun seekToPrevious() {
        seekTo(ChapterMarks.previousStart(marks(), currentPosition))
    }

    override fun hasNextMediaItem(): Boolean = true

    override fun hasPreviousMediaItem(): Boolean = true
}
