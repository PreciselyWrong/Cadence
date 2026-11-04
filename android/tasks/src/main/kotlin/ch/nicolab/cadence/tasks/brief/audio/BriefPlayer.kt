package ch.nicolab.cadence.tasks.brief.audio

import android.content.ComponentName
import android.content.Context
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Ce que le lecteur du service dit à l'écran. [key] : le brief chargé (`<date>-v<version>`), null si aucun. */
data class PlayerState(
    val key: String? = null,
    val playing: Boolean = false,
    val positionMs: Long = 0,
    val durationMs: Long = 0,
)

/**
 * Pilote de l'écran sur [BriefPlaybackService] (contrôleur Media3). Appelé depuis le thread principal ; la lecture
 * continue dans le service quand l'écran se ferme.
 */
class BriefPlayer(context: Context, scope: CoroutineScope) {
    private val appContext = context.applicationContext
    private var future: ListenableFuture<MediaController>? = null
    private var controller: MediaController? = null
    private val waiting = ArrayList<(MediaController) -> Unit>()

    private val _state = MutableStateFlow(PlayerState())
    val state: StateFlow<PlayerState> = _state.asStateFlow()

    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) = publish(player)
    }

    init {
        scope.launch {
            while (isActive) {
                delay(TICK_MS)
                controller?.takeIf { it.isPlaying }?.let(::publish)
            }
        }
    }

    /** Charge [stored] (reprend à [startMs]) puis lit ; si ce brief est déjà chargé, reprend simplement. */
    fun play(stored: StoredAudio, startMs: Long) = whenConnected { player ->
        if (player.currentMediaItem?.mediaId != stored.key) {
            player.setMediaItem(MediaItem.Builder().setMediaId(stored.key).build(), startMs.coerceAtLeast(0))
            player.prepare()
        } else if (player.playbackState == Player.STATE_ENDED) {
            player.seekTo(0)
        }
        player.play()
    }

    fun toggle() = whenConnected { player -> if (player.isPlaying) player.pause() else player.play() }

    fun next() = whenConnected { it.seekToNext() }

    fun previous() = whenConnected { it.seekToPrevious() }

    /** Se connecte au service s'il tourne déjà, pour que le bouton montre une lecture commencée avant. */
    fun attach() = whenConnected { publish(it) }

    fun release() {
        future?.let { MediaController.releaseFuture(it) }
        future = null
        controller = null
        waiting.clear()
    }

    private fun publish(player: Player) {
        _state.value = PlayerState(
            key = player.currentMediaItem?.mediaId,
            playing = player.isPlaying,
            positionMs = player.currentPosition.coerceAtLeast(0),
            durationMs = player.duration.takeIf { it > 0 } ?: 0,
        )
    }

    private fun whenConnected(action: (MediaController) -> Unit) {
        controller?.let(action) ?: run {
            waiting += action
            if (future != null) return
            val token = SessionToken(appContext, ComponentName(appContext, BriefPlaybackService::class.java))
            val pending = MediaController.Builder(appContext, token).buildAsync()
            future = pending
            pending.addListener({
                val connected = runCatching { pending.get() }.getOrNull()
                if (connected == null) {
                    future = null
                    waiting.clear()
                    return@addListener
                }
                connected.addListener(listener)
                controller = connected
                val actions = waiting.toList()
                waiting.clear()
                actions.forEach { it(connected) }
                publish(connected)
            }, ContextCompat.getMainExecutor(appContext))
        }
    }

    private companion object {
        const val TICK_MS = 500L
    }
}
