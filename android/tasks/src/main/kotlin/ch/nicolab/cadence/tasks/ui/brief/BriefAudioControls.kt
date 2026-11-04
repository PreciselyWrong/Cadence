package ch.nicolab.cadence.tasks.ui.brief

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.SkipNext
import androidx.compose.material.icons.outlined.SkipPrevious
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.brief.audio.AudioChoice
import ch.nicolab.cadence.tasks.brief.audio.AudioSource
import ch.nicolab.cadence.tasks.brief.audio.ChapterMark
import ch.nicolab.cadence.tasks.brief.audio.ChapterMarks
import ch.nicolab.cadence.tasks.brief.audio.PlayerState
import ch.nicolab.cadence.tasks.brief.audio.SpeakerState

/** Ce que l'écran sait de la lecture de ce brief. */
internal class BriefAudioUi(
    val choice: AudioChoice,
    /** Identifiant `<date>-v<version>` de ce brief, pour reconnaître le fichier chargé dans le lecteur. */
    val briefKey: String,
    val player: PlayerState,
    val speaker: SpeakerState,
    val marks: List<ChapterMark>,
    /** Nombre de chapitres lus par la voix du système. */
    val speechChapters: Int,
)

/**
 * « Écouter · N min » dans l'en-tête du résumé ; une fois lancée, pause, chapitre précédent/suivant et position.
 * Masqué quand il n'y a ni audio ni script à lire.
 */
@Composable
internal fun BriefAudioControls(
    ui: BriefAudioUi,
    onPlay: () -> Unit,
    onToggle: () -> Unit,
    onNext: () -> Unit,
    onPrevious: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val speechActive = ui.speaker.loaded
    val fileActive = !speechActive && ui.player.key == ui.briefKey
    if (!speechActive && !fileActive) {
        val minutes = ui.choice.minutes
        if (ui.choice.source == AudioSource.NONE) return
        SecondaryAction(
            label = if (minutes != null) stringResource(R.string.brief_audio_listen, minutes) else stringResource(R.string.brief_audio_listen_short),
            modifier = modifier,
            onClick = onPlay,
        )
        return
    }
    val playing = if (speechActive) ui.speaker.speaking else ui.player.playing
    val chapterLine = if (speechActive) {
        stringResource(R.string.brief_audio_chapter, ui.speaker.chapter + 1, ui.speechChapters.coerceAtLeast(1))
    } else if (ui.marks.isNotEmpty()) {
        stringResource(R.string.brief_audio_chapter, ChapterMarks.indexAt(ui.marks, ui.player.positionMs) + 1, ui.marks.size)
    } else {
        null
    }
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onPrevious) {
            Icon(Icons.Outlined.SkipPrevious, contentDescription = stringResource(R.string.brief_audio_previous), tint = cadence.onSurface)
        }
        IconButton(onClick = onToggle) {
            Icon(
                if (playing) Icons.Outlined.Pause else Icons.Outlined.PlayArrow,
                contentDescription = stringResource(if (playing) R.string.brief_audio_pause else R.string.brief_audio_play),
                tint = cadence.onSurface,
            )
        }
        IconButton(onClick = onNext) {
            Icon(Icons.Outlined.SkipNext, contentDescription = stringResource(R.string.brief_audio_next), tint = cadence.onSurface)
        }
        Column(Modifier.padding(start = Space.sm)) {
            chapterLine?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurface) }
            if (!speechActive && ui.player.durationMs > 0) {
                Text(
                    clock(ui.player.positionMs) + " / " + clock(ui.player.durationMs),
                    style = MaterialTheme.typography.bodySmall,
                    color = cadence.onSurfaceVariant,
                )
            }
        }
    }
}

private fun clock(ms: Long): String {
    val seconds = (ms / 1000).toInt()
    return "%d:%02d".format(seconds / 60, seconds % 60)
}
