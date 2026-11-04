package ch.nicolab.cadence.tasks.ui.brief

import android.text.format.Formatter
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.components.Hairline
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.components.readableTintOf
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.brief.audio.BriefVoice
import ch.nicolab.cadence.tasks.brief.audio.BriefVoiceCatalog
import ch.nicolab.cadence.tasks.brief.audio.VoiceInstallState

/** Retrait des lignes sous une tâche : aligné sur son titre, après la case (24 dp) et son espace (16 dp). */
internal val RowContentInset = Space.xl + Space.lg

/**
 * Ce que la personne a décidé sur une carte, à la place de ses boutons : « Déplacé · Jeu 5 », « Réponse : Oui »,
 * « Reporté à demain ». La coche dit que c'est pris en compte ; « Annuler » du message rend les boutons.
 */
@Composable
internal fun DecisionTag(text: String, modifier: Modifier = Modifier) {
    val palette = cadence
    Row(
        modifier
            .background(palette.containerHigh, Radius.Chip)
            .padding(horizontal = Space.md, vertical = Space.sm)
            .semantics(mergeDescendants = true) { contentDescription = text },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Space.xs),
    ) {
        Icon(
            Icons.Outlined.Check,
            contentDescription = null,
            tint = readableTintOf(palette.primary, palette.containerHigh),
            modifier = Modifier.size(Size.iconSm),
        )
        Text(text, style = MaterialTheme.typography.labelLarge, color = palette.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/**
 * « Écouter » sans voix installée : Siwis ou Tom, avec leur licence et leur taille. Télécharger lance l'installation (la
 * seule fois où le réseau sert), puis la lecture démarre d'elle-même. Rien ne se télécharge avant l'appui.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun BriefVoiceSheet(
    install: VoiceInstallState,
    onDownload: (BriefVoice) -> Unit,
    onCancel: () -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    CadenceSheet(
        title = stringResource(R.string.brief_voice_sheet_title),
        subtitle = stringResource(R.string.brief_voice_sheet_message),
        dismiss = onDismiss,
    ) {
        BriefVoiceCatalog.voices.forEach { voice ->
            Hairline()
            val downloading = install.downloadingId == voice.id
            Column(Modifier.fillMaxWidth().padding(vertical = Space.md), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(voice.title, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface)
                        Text(
                            stringResource(R.string.brief_voice_license, voice.license) + " · " +
                                stringResource(R.string.brief_voice_size, Formatter.formatShortFileSize(context, voice.pack.bytes)),
                            style = MaterialTheme.typography.bodySmall,
                            color = cadence.onSurfaceVariant,
                        )
                    }
                    if (!downloading) {
                        SecondaryAction(
                            stringResource(R.string.brief_voice_download),
                            enabled = install.downloadingId == null,
                            onClick = { onDownload(voice) },
                        )
                    }
                }
                if (downloading) {
                    LinearProgressIndicator(progress = { install.progress }, modifier = Modifier.fillMaxWidth(), color = cadence.primary, trackColor = cadence.containerHigh)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            stringResource(R.string.brief_voice_progress, (install.progress * PERCENT).toInt()),
                            style = MaterialTheme.typography.bodySmall,
                            color = cadence.onSurfaceVariant,
                            modifier = Modifier.weight(1f),
                        )
                        TertiaryAction(stringResource(R.string.brief_voice_cancel), onClick = onCancel)
                    }
                }
            }
        }
        install.message?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = cadence.error, modifier = Modifier.padding(bottom = Space.sm)) }
        Spacer(Modifier.height(Space.lg))
    }
}

private const val PERCENT = 100
