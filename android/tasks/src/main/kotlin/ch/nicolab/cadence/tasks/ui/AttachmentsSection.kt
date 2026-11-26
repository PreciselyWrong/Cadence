package ch.nicolab.cadence.tasks.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.attachments.AttachmentItem
import ch.nicolab.cadence.tasks.attachments.AttachmentTarget
import ch.nicolab.cadence.tasks.attachments.AttachmentsClient
import ch.nicolab.cadence.tasks.plugins.NotConnected
import ch.nicolab.cadence.tasks.sync.AuthError
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val ATTACHMENT_DATE: DateTimeFormatter =
    DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(Locale.FRENCH)

/**
 * Section « Pièces jointes » en ligne pour une tâche ou un projet :
 * masquée si le drapeau `attachments` est coupé, sinon liste, ajout via le sélecteur système,
 * ouverture via `FileProvider` et suppression par appui long.
 *
 * Fiche de tâche (`quietWhenEmpty`) : rien n'est montré sans pièce jointe ; « Joindre » en bas de la fiche
 * incrémente `pickRequests` pour ouvrir le sélecteur, et `onAvailable` dit si le serveur accepte les pièces jointes.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun AttachmentsSection(
    target: AttachmentTarget,
    modifier: Modifier = Modifier,
    quietWhenEmpty: Boolean = false,
    pickRequests: Int = 0,
    onAvailable: (Boolean) -> Unit = {},
) {
    val context = LocalContext.current
    val client = remember(context) { TasksGraph.attachments(context) }
    val scope = rememberCoroutineScope()
    val palette = cadence

    var enabled by remember(target) { mutableStateOf<Boolean?>(null) }
    var items by remember(target) { mutableStateOf<List<AttachmentItem>>(emptyList()) }
    var offline by remember(target) { mutableStateOf(false) }
    var error by remember(target) { mutableStateOf<String?>(null) }
    var uploading by remember(target) { mutableStateOf(false) }
    var openingUid by remember(target) { mutableStateOf<String?>(null) }
    var toDelete by remember(target) { mutableStateOf<AttachmentItem?>(null) }

    val offlineLabel = stringResource(R.string.attachments_offline)
    val uploadFallback = stringResource(R.string.attachments_upload_error)
    val deleteFallback = stringResource(R.string.attachments_delete_error)
    val downloadFallback = stringResource(R.string.attachments_download_error)
    val noAppLabel = stringResource(R.string.attachments_no_app)

    LaunchedEffect(client, target) {
        offline = false
        error = null
        val flag = try {
            client.isEnabled()
        } catch (e: CancellationException) {
            throw e
        } catch (t: Throwable) {
            if (isOfflineFailure(t)) {
                offline = true
                enabled = true
                return@LaunchedEffect
            }
            enabled = true
            false
        }
        if (flag == false && !offline) {
            enabled = false
            return@LaunchedEffect
        }
        enabled = true
        try {
            items = client.list(target)
        } catch (e: CancellationException) {
            throw e
        } catch (t: Throwable) {
            if (isOfflineFailure(t)) {
                offline = true
            } else {
                error = t.message?.takeIf { it.isNotBlank() }
            }
        }
    }

    LaunchedEffect(enabled) { enabled?.let(onAvailable) }
    if (enabled != true) return

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            uploading = true
            error = null
            offline = false
            try {
                val meta = withContext(Dispatchers.IO) { queryPickedFile(context, uri) }
                val uploaded = client.upload(
                    target = target,
                    filename = meta.name,
                    mimeType = meta.mimeType,
                    contentLength = meta.size,
                    openStream = {
                        context.contentResolver.openInputStream(uri)
                            ?: throw IOException("Impossible de lire le fichier")
                    },
                )
                items = items + uploaded
            } catch (e: CancellationException) {
                throw e
            } catch (t: Throwable) {
                if (isOfflineFailure(t)) {
                    offline = true
                    error = offlineLabel
                } else {
                    error = t.message?.takeIf { it.isNotBlank() } ?: uploadFallback
                }
            } finally {
                uploading = false
            }
        }
    }

    // Seul un nouveau toucher sur « Joindre » ouvre le sélecteur, pas un retour de la section à l'écran.
    var handledPicks by remember(target) { mutableIntStateOf(pickRequests) }
    LaunchedEffect(pickRequests) {
        if (pickRequests != handledPicks) {
            handledPicks = pickRequests
            picker.launch(arrayOf("*/*"))
        }
    }

    if (quietWhenEmpty && items.isEmpty() && !uploading && error == null) return

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(R.string.attachments_title),
                style = MaterialTheme.typography.titleSmall,
                color = palette.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            TextButton(
                onClick = { picker.launch(arrayOf("*/*")) },
                enabled = !uploading,
            ) {
                if (uploading) {
                    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(Space.xs))
                    Text(stringResource(R.string.attachments_uploading))
                } else {
                    Text(stringResource(R.string.attachments_add))
                }
            }
        }

        if (offline) {
            Text(
                offlineLabel,
                style = MaterialTheme.typography.bodySmall,
                color = palette.onSurfaceVariant,
            )
        } else if (error != null) {
            Text(
                error.orEmpty(),
                style = MaterialTheme.typography.bodySmall,
                color = palette.error,
            )
        }

        if (items.isEmpty() && !offline && error == null) {
            Text(
                stringResource(R.string.attachments_empty),
                style = MaterialTheme.typography.bodySmall,
                color = palette.onSurfaceVariant,
            )
        } else if (items.isNotEmpty()) {
            RowGroup {
                items.forEachIndexed { index, item ->
                    val subtitle = buildList {
                        add(AttachmentsClient.formatFileSize(item.fileSize))
                        formatAttachmentDate(item.createdAt)?.let(::add)
                    }.joinToString(" · ")
                    Surface(
                        color = palette.card,
                        shape = rowGroupShape(index, items.size),
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = Size.touch)
                            .combinedClickable(
                                role = Role.Button,
                                enabled = openingUid == null,
                                onClick = {
                                    scope.launch {
                                        openingUid = item.uid
                                        error = null
                                        try {
                                            val file = client.downloadToCache(target, item, context.cacheDir)
                                            val uri = FileProvider.getUriForFile(
                                                context,
                                                "${context.packageName}.fileprovider",
                                                file,
                                            )
                                            val intent = Intent(Intent.ACTION_VIEW)
                                                .setDataAndType(uri, item.mimeType.ifBlank { "*/*" })
                                                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                            try {
                                                context.startActivity(intent)
                                            } catch (_: ActivityNotFoundException) {
                                                Toast.makeText(context, noAppLabel, Toast.LENGTH_SHORT).show()
                                            }
                                        } catch (e: CancellationException) {
                                            throw e
                                        } catch (t: Throwable) {
                                            val msg = if (isOfflineFailure(t)) {
                                                offlineLabel
                                            } else {
                                                t.message?.takeIf { it.isNotBlank() } ?: downloadFallback
                                            }
                                            Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                                        } finally {
                                            openingUid = null
                                        }
                                    }
                                },
                                onLongClick = { toDelete = item },
                            ),
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = Space.md, vertical = Space.sm),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(Space.sm),
                        ) {
                            Icon(
                                Icons.Outlined.AttachFile,
                                contentDescription = null,
                                tint = palette.onSurfaceVariant,
                                modifier = Modifier.size(20.dp),
                            )
                            Column(Modifier.weight(1f)) {
                                Text(
                                    item.displayName,
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = palette.onSurface,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                if (subtitle.isNotEmpty()) {
                                    Text(
                                        subtitle,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = palette.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                            if (openingUid == item.uid) {
                                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                            }
                        }
                    }
                }
            }
        }
    }

    toDelete?.let { pending ->
        AlertDialog(
            onDismissRequest = { toDelete = null },
            title = { Text(stringResource(R.string.attachments_delete_title)) },
            text = { Text(pending.displayName) },
            confirmButton = {
                TextButton(
                    onClick = {
                        toDelete = null
                        scope.launch {
                            error = null
                            try {
                                client.delete(target, pending.uid)
                                items = items.filterNot { it.uid == pending.uid }
                            } catch (e: CancellationException) {
                                throw e
                            } catch (t: Throwable) {
                                val msg = if (isOfflineFailure(t)) {
                                    offlineLabel
                                } else {
                                    t.message?.takeIf { it.isNotBlank() } ?: deleteFallback
                                }
                                Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                            }
                        }
                    },
                ) {
                    Text(stringResource(R.string.attachments_delete_confirm), color = palette.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { toDelete = null }) {
                    Text(stringResource(R.string.attachments_delete_cancel))
                }
            },
        )
    }
}

private data class PickedFileMeta(val name: String, val size: Long, val mimeType: String)

private fun queryPickedFile(context: Context, uri: Uri): PickedFileMeta {
    var name = uri.lastPathSegment?.substringAfterLast('/') ?: "fichier"
    var size = -1L
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
            val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (nameIdx >= 0) {
                cursor.getString(nameIdx)?.takeIf { it.isNotBlank() }?.let { name = it }
            }
            val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (sizeIdx >= 0 && !cursor.isNull(sizeIdx)) {
                size = cursor.getLong(sizeIdx)
            }
        }
    }
    val mimeType = context.contentResolver.getType(uri) ?: "application/octet-stream"
    return PickedFileMeta(name = name, size = size, mimeType = mimeType)
}

private fun formatAttachmentDate(iso: String?): String? {
    if (iso.isNullOrBlank()) return null
    return runCatching {
        Instant.parse(iso).atZone(ZoneId.systemDefault()).toLocalDate().format(ATTACHMENT_DATE)
    }.getOrNull()
}

private fun isOfflineFailure(t: Throwable): Boolean =
    t is NotConnected ||
        t is AuthError ||
        t is UnknownHostException ||
        t is ConnectException ||
        t is SocketTimeoutException ||
        (t is IOException && t.message?.startsWith("HTTP ") != true && t.message?.contains("connect", ignoreCase = true) == true)
