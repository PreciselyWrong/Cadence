package ch.nicolab.cadence.tasks.ui.brief

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.brief.audio.AudioChoice
import ch.nicolab.cadence.tasks.brief.audio.AudioSource
import ch.nicolab.cadence.tasks.brief.audio.ChapterMark
import ch.nicolab.cadence.tasks.brief.audio.ChapterMarks
import ch.nicolab.cadence.tasks.brief.audio.PlayerState

/** Ce que l'écran sait de la lecture de ce brief. */
internal class BriefAudioUi(
    val choice: AudioChoice,
    /** Identifiant `<date>-v<version>` de ce brief, pour reconnaître le fichier chargé dans le lecteur. */
    val briefKey: String,
    val player: PlayerState,
    val marks: List<ChapterMark>,
    /** La voix prépare le fichier après « Écouter » : le bouton le dit au lieu de rester muet. */
    val preparing: Boolean = false,
)

/**
 * « Écouter · N min » dans l'en-tête du résumé ; une fois lancée, pause, partie précédente/suivante et position.
 * Masqué quand il n'y a ni fichier, ni MP3 du serveur, ni script que la voix Piper puisse lire.
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
    if (ui.preparing) {
        ListenButton(stringResource(R.string.brief_audio_preparing), modifier, enabled = false, onClick = {})
        return
    }
    if (ui.player.key != ui.briefKey) {
        val minutes = ui.choice.minutes
        if (ui.choice.source == AudioSource.NONE) return
        ListenButton(
            label = if (minutes != null) stringResource(R.string.brief_audio_listen, minutes) else stringResource(R.string.brief_audio_listen_short),
            modifier = modifier,
            onClick = onPlay,
        )
        return
    }
    val playing = ui.player.playing
    val chapterLine = ChapterMarks.titleAt(ui.marks, ui.player.positionMs)
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
            if (ui.player.durationMs > 0) {
                Text(
                    clock(ui.player.positionMs) + " / " + clock(ui.player.durationMs),
                    style = MaterialTheme.typography.bodySmall,
                    color = cadence.onSurfaceVariant,
                )
            }
        }
    }
}

/** Une ligne discrète, pas un gros bouton : l'audio accompagne le résumé sans passer devant lui. */
@Composable
private fun ListenButton(label: String, modifier: Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    val tint = if (enabled) cadence.primary else cadence.onSurfaceVariant
    Row(
        modifier
            .heightIn(min = Size.touch)
            .clip(Radius.Control)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(end = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.PlayArrow, contentDescription = null, tint = tint)
        Spacer(Modifier.width(Space.xs))
        Text(label, style = MaterialTheme.typography.labelLarge, color = tint)
    }
}

private fun clock(ms: Long): String {
    val seconds = (ms / 1000).toInt()
    return "%d:%02d".format(seconds / 60, seconds % 60)
}
