package ch.nicolab.cadence.tasks.ui.settings

import android.text.format.Formatter
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.Hairline
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.brief.audio.BriefAudioPrefs

/**
 * Voix de ce téléphone (réglage local à l'appareil, jamais envoyé au serveur) : choix, téléchargement, suppression,
 * vitesse, extrait. Aucune voix n'est installée par défaut.
 */
@Composable
internal fun BriefVoiceLocalPanel() {
    val viewModel: BriefVoiceViewModel = viewModel()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val selected = state.rows.firstOrNull { it.voice.id == state.selectedId }

    Panel {
        Text(stringResource(R.string.brief_voice_local_title), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
        Text(stringResource(R.string.brief_voice_local_intro), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
        state.rows.forEach { row ->
            Hairline()
            val downloading = state.downloadingId == row.voice.id
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(row.voice.title, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface)
                        Text(
                            stringResource(R.string.brief_voice_license, row.voice.license),
                            style = MaterialTheme.typography.bodySmall,
                            color = cadence.onSurfaceVariant,
                        )
                        Text(
                            if (row.installed) {
                                stringResource(R.string.brief_voice_installed, Formatter.formatShortFileSize(context, row.bytes))
                            } else {
                                stringResource(R.string.brief_voice_size, Formatter.formatShortFileSize(context, row.voice.pack.bytes))
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = cadence.onSurfaceVariant,
                        )
                    }
                    if (row.installed) {
                        ChoiceChip(
                            label = stringResource(if (row.voice.id == state.selectedId) R.string.brief_voice_selected else R.string.brief_voice_choose),
                            selected = row.voice.id == state.selectedId,
                            onClick = { viewModel.select(row.voice) },
                        )
                    }
                }
                if (downloading) {
                    LinearProgressIndicator(progress = { state.progress }, modifier = Modifier.fillMaxWidth(), color = cadence.primary, trackColor = cadence.containerHigh)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            stringResource(R.string.brief_voice_progress, (state.progress * PERCENT).toInt()),
                            style = MaterialTheme.typography.bodySmall,
                            color = cadence.onSurfaceVariant,
                            modifier = Modifier.weight(1f),
                        )
                        TertiaryAction(stringResource(R.string.brief_voice_cancel), onClick = viewModel::cancelDownload)
                    }
                } else if (row.installed) {
                    Row { TertiaryAction(stringResource(R.string.brief_voice_delete), onClick = { viewModel.delete(row.voice) }) }
                } else {
                    Row {
                        SecondaryAction(
                            stringResource(R.string.brief_voice_download),
                            enabled = state.downloadingId == null,
                            onClick = { viewModel.download(row.voice) },
                        )
                    }
                }
            }
        }
        state.message?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = cadence.error) }
        if (state.rows.any { it.installed }) {
            Hairline()
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { viewModel.setSpeed(state.speed - BriefAudioPrefs.SPEED_STEP) }, enabled = state.speed > BriefAudioPrefs.MIN_SPEED) {
                    Icon(Icons.Outlined.Remove, contentDescription = stringResource(R.string.brief_voice_slower), tint = cadence.onSurface)
                }
                Text(
                    stringResource(R.string.brief_voice_speed, "%.1f".format(state.speed)),
                    style = MaterialTheme.typography.bodyLarge,
                    color = cadence.onSurface,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { viewModel.setSpeed(state.speed + BriefAudioPrefs.SPEED_STEP) }, enabled = state.speed < BriefAudioPrefs.MAX_SPEED) {
                    Icon(Icons.Outlined.Add, contentDescription = stringResource(R.string.brief_voice_faster), tint = cadence.onSurface)
                }
            }
            selected?.takeIf { it.installed }?.let { row ->
                Row {
                    SecondaryAction(
                        stringResource(R.string.brief_voice_preview),
                        enabled = !state.previewing,
                        onClick = { viewModel.preview(row.voice) },
                    )
                }
            }
            Spacer(Modifier.height(Space.xs))
            Text(
                stringResource(R.string.brief_voice_storage, Formatter.formatShortFileSize(context, state.storageBytes)),
                style = MaterialTheme.typography.bodySmall,
                color = cadence.onSurfaceVariant,
            )
        }
    }
}

private const val PERCENT = 100
