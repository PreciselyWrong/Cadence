@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.LinkOff
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.notes.PublicShareState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** Feuille en ligne pour activer, copier, renouveler ou arrêter le partage public d'une note. */
@Composable
internal fun PublicShareSheet(
    noteUid: String,
    noteTitle: String,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val client = remember(context) { TasksGraph.publicShare(context) }
    val scope = rememberCoroutineScope()
    val palette = cadence
    val offlineMessage = stringResource(R.string.note_public_share_offline)

    var loading by remember(noteUid) { mutableStateOf(true) }
    var busy by remember(noteUid) { mutableStateOf(false) }
    var state by remember(noteUid) { mutableStateOf<PublicShareState?>(null) }
    var publicUrl by remember(noteUid) { mutableStateOf<String?>(null) }
    var error by remember(noteUid) { mutableStateOf<String?>(null) }
    var confirmRotate by remember(noteUid) { mutableStateOf(false) }

    suspend fun applyState(next: PublicShareState) {
        state = next
        publicUrl = if (next.enabled && next.token != null) client.publicUrl(next.token) else null
    }

    LaunchedEffect(noteUid) {
        loading = true
        error = null
        try {
            applyState(client.get(noteUid))
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            error = offlineMessage
        } finally {
            loading = false
        }
    }

    fun runAction(block: suspend () -> PublicShareState) {
        if (busy) return
        busy = true
        error = null
        scope.launch {
            try {
                applyState(block())
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                error = offlineMessage
            } finally {
                busy = false
            }
        }
    }

    CadenceSheet(
        title = stringResource(R.string.note_public_share_title),
        subtitle = noteTitle.ifBlank { stringResource(R.string.tasks_note_untitled) },
        dismiss = onDismiss,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(bottom = Space.xl),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            if (loading) {
                Row(
                    Modifier.fillMaxWidth().padding(vertical = Space.lg),
                    horizontalArrangement = Arrangement.Center,
                ) {
                    CircularProgressIndicator()
                }
            } else {
                error?.let { msg ->
                    Text(msg, style = MaterialTheme.typography.bodyMedium, color = palette.error)
                }
                val current = state
                if (current == null) {
                    Button(
                        onClick = {},
                        enabled = false,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(stringResource(R.string.note_public_share_enable))
                    }
                } else if (!current.enabled) {
                    Text(
                        stringResource(R.string.note_public_share_hint),
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.onSurfaceVariant,
                    )
                    Button(
                        onClick = { runAction { client.enable(noteUid) } },
                        enabled = !busy && error == null,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Outlined.Link, contentDescription = null)
                        Spacer(Modifier.height(Space.xs))
                        Text(
                            stringResource(R.string.note_public_share_enable),
                            modifier = Modifier.padding(start = Space.sm),
                        )
                    }
                } else {
                    val url = publicUrl.orEmpty()
                    if (url.isNotBlank()) {
                        Text(
                            stringResource(R.string.note_public_share_url_label),
                            style = MaterialTheme.typography.labelMedium,
                            color = palette.onSurfaceVariant,
                        )
                        Panel {
                            SelectionContainer {
                                Text(
                                    url,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = palette.onSurface,
                                    modifier = Modifier.fillMaxWidth().padding(Space.md),
                                )
                            }
                        }
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(Space.sm),
                        ) {
                            Button(
                                onClick = {
                                    context.copyText(noteTitle, url)
                                    Toast.makeText(context, R.string.note_public_share_copied, Toast.LENGTH_SHORT).show()
                                },
                                enabled = !busy,
                                modifier = Modifier.weight(1f),
                            ) {
                                Icon(Icons.Outlined.ContentCopy, contentDescription = null)
                                Text(
                                    stringResource(R.string.note_public_share_copy),
                                    modifier = Modifier.padding(start = Space.xs),
                                )
                            }
                            OutlinedButton(
                                onClick = { context.shareText(url, noteTitle) },
                                enabled = !busy,
                                modifier = Modifier.weight(1f),
                            ) {
                                Icon(Icons.Outlined.Share, contentDescription = null)
                                Text(
                                    stringResource(R.string.note_public_share_share),
                                    modifier = Modifier.padding(start = Space.xs),
                                )
                            }
                        }
                    }
                    OutlinedButton(
                        onClick = { confirmRotate = true },
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Outlined.Refresh, contentDescription = null)
                        Text(
                            stringResource(R.string.note_public_share_rotate),
                            modifier = Modifier.padding(start = Space.sm),
                        )
                    }
                    TextButton(
                        onClick = { runAction { client.disable(noteUid) } },
                        enabled = !busy,
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                    ) {
                        Icon(Icons.Outlined.LinkOff, contentDescription = null, tint = palette.error)
                        Text(
                            stringResource(R.string.note_public_share_disable),
                            color = palette.error,
                            modifier = Modifier.padding(start = Space.sm),
                        )
                    }
                }
            }
        }
    }

    if (confirmRotate) {
        AlertDialog(
            onDismissRequest = { confirmRotate = false },
            title = { Text(stringResource(R.string.note_public_share_rotate_confirm_title)) },
            text = { Text(stringResource(R.string.note_public_share_rotate_confirm_body)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmRotate = false
                        runAction { client.rotate(noteUid) }
                    },
                ) {
                    Text(stringResource(R.string.note_public_share_rotate_confirm_yes))
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmRotate = false }) {
                    Text(stringResource(R.string.note_public_share_cancel))
                }
            },
        )
    }
}
