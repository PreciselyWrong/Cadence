package ch.nicolab.cadence.settings

import android.content.Intent
import android.net.Uri
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.readableTintOf
import ch.nicolab.cadence.designsystem.theme.Space
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.TextButton
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.tasks.calendarfeeds.CalendarFeed
import ch.nicolab.cadence.tasks.calendarfeeds.CalendarFeedsClient
import ch.nicolab.cadence.tasks.plugins.NotConnected
import ch.nicolab.cadence.tasks.sync.AuthError
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.google.GoogleAccountStatus
import ch.nicolab.cadence.tasks.google.GoogleOAuthRoute
import ch.nicolab.cadence.tasks.model.SyncStatusText
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import java.time.Instant
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircleOutline
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.R
import ch.nicolab.cadence.calendar.CalendarGlobalSettings
import ch.nicolab.cadence.calendar.CalendarGraph
import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.calendar.HiddenEvent
import ch.nicolab.cadence.calendar.day
import ch.nicolab.cadence.calendar.isUsed
import ch.nicolab.cadence.designsystem.components.SettingRow
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SettingToggleRow
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.cadence
import kotlinx.coroutines.launch

/** Sous-titre de la rubrique : nombre d'agendas affichés, absent tant que la permission manque. */
@Composable
internal fun calendarsSubtitle(): String? {
    val context = LocalContext.current
    val repository = remember(context) { CalendarGraph.repository(context) }
    val calendarsFlow = remember(repository) { repository.calendars() }
    val permissionMissing by repository.permissionMissing.collectAsStateWithLifecycle(initialValue = true)
    val calendars by calendarsFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    if (permissionMissing) return null
    val shown = calendars.count { it.display.isUsed(it.calendar) && (it.display.agenda || it.display.tasks) }
    return pluralStringResource(R.plurals.settings_calendars_count, shown, shown)
}

/**
 * Réglages › Agendas : où apparaît chaque agenda de l'appareil, et les deux options communes.
 * Cocher un événement ne modifie jamais le fournisseur d'agendas.
 */
@Composable
internal fun CalendarsPage() {
    val context = LocalContext.current
    val repository = remember(context) { CalendarGraph.repository(context) }
    val settings by repository.globalSettings.collectAsStateWithLifecycle(initialValue = CalendarGlobalSettings())
    val hiddenFlow = remember(repository) { repository.hiddenEvents() }
    val hidden by hiddenFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    val scope = rememberCoroutineScope()
    val palette = cadence

    GoogleAccountSection()
    SubscribedCalendarsSection()
    Text(
        stringResource(R.string.calendars_intro),
        style = MaterialTheme.typography.bodyMedium,
        color = palette.onSurfaceVariant,
    )
    Text(
        stringResource(R.string.calendars_use_hint),
        style = MaterialTheme.typography.bodySmall,
        color = palette.onSurfaceVariant,
    )
    CalendarChoices()
    HiddenEventsSection(
        hidden = hidden,
        onRestore = { key -> scope.launch { repository.restoreEvent(key) } },
    )
    RowGroup {
        SettingToggleRow(
            title = stringResource(R.string.calendars_check_title),
            checked = settings.checkEvents,
            onCheckedChange = { checked -> scope.launch { repository.setCheckEvents(checked) } },
            icon = Icons.Outlined.CheckCircleOutline,
            subtitle = stringResource(R.string.calendars_check_subtitle),
            shape = rowGroupShape(0, 2),
        )
        SettingToggleRow(
            title = stringResource(R.string.calendars_hide_done_title),
            checked = settings.hideDone,
            onCheckedChange = { checked -> scope.launch { repository.setHideDone(checked) } },
            icon = Icons.Outlined.VisibilityOff,
            subtitle = stringResource(R.string.calendars_hide_done_subtitle),
            shape = rowGroupShape(1, 2),
        )
    }
}

private val HIDDEN_DAY: DateTimeFormatter = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(java.util.Locale.FRENCH)

/** Événements masqués dans Cadence : ils restent dans l'agenda de l'appareil et se rétablissent ici. */
@Composable
private fun HiddenEventsSection(hidden: List<HiddenEvent>, onRestore: (EventInstanceKey) -> Unit) {
    val palette = cadence
    Text(
        stringResource(R.string.calendars_hidden_title),
        style = MaterialTheme.typography.titleMedium,
        color = palette.onSurface,
    )
    if (hidden.isEmpty()) {
        Text(
            stringResource(R.string.calendars_hidden_empty),
            style = MaterialTheme.typography.bodyMedium,
            color = palette.onSurfaceVariant,
        )
        return
    }
    val zone = remember { ZoneId.systemDefault() }
    RowGroup {
        hidden.forEachIndexed { index, item ->
            SettingRow(
                title = item.title.ifBlank { stringResource(R.string.agenda_untitled) },
                subtitle = item.day(zone).format(HIDDEN_DAY),
                icon = Icons.Outlined.VisibilityOff,
                shape = rowGroupShape(index, hidden.size),
                trailing = {
                    Text(
                        stringResource(R.string.calendars_hidden_restore),
                        style = MaterialTheme.typography.labelLarge,
                        color = readableTintOf(palette.primary, palette.card),
                    )
                },
                onClick = { onRestore(item.key) },
            )
        }
    }
}

/** Section « Google » de Réglages › Agendas : état de la synchro serveur et (re)connexion dans le navigateur. */
@Composable
private fun GoogleAccountSection() {
    val context = LocalContext.current
    val client = remember(context) { TasksGraph.googleSync(context) }
    val refreshCount by GoogleOAuthRoute.refreshCount.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val palette = cadence
    var status by remember { mutableStateOf<GoogleAccountStatus?>(null) }
    var connecting by remember { mutableStateOf(false) }
    var connectError by remember { mutableStateOf<String?>(null) }
    var resumeTrigger by remember { mutableStateOf(0) }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) resumeTrigger++
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(client, refreshCount, resumeTrigger) {
        client.status().onSuccess { status = it }
    }

    val current = status ?: return
    if (!current.configured) return

    val openErrorFallback = stringResource(R.string.calendars_google_open_error)
    val startConnect: () -> Unit = {
        scope.launch {
            connecting = true
            connectError = null
            client.connectUrl()
                .onSuccess { url ->
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        .addCategory(Intent.CATEGORY_BROWSABLE)
                    runCatching { context.startActivity(intent) }
                        .onFailure { connectError = openErrorFallback }
                }
                .onFailure { err ->
                    connectError = err.message ?: openErrorFallback
                }
            connecting = false
        }
    }

    Panel {
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            Text(
                stringResource(R.string.calendars_source_google),
                style = MaterialTheme.typography.titleMedium,
                color = palette.onSurface,
            )
            if (!current.connected) {
                Text(
                    stringResource(R.string.calendars_google_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.onSurfaceVariant,
                )
                Spacer(Modifier.height(Space.xs))
                PrimaryAction(
                    label = stringResource(R.string.calendars_google_connect),
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !connecting,
                    onClick = startConnect,
                )
            } else {
                current.email?.let { email ->
                    Text(
                        email,
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.onSurface,
                    )
                }
                current.lastSyncedAt?.let { syncedAt ->
                    Text(
                        stringResource(
                            R.string.calendars_google_synced,
                            SyncStatusText.ago(syncedAt, Instant.now()),
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.onSurfaceVariant,
                    )
                }
                current.lastError?.let { err ->
                    Text(
                        err,
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.error,
                    )
                    Spacer(Modifier.height(Space.xs))
                    PrimaryAction(
                        label = stringResource(R.string.calendars_google_reconnect),
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !connecting,
                        onClick = startConnect,
                    )
                }
            }
            connectError?.let { err ->
                Text(
                    err,
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.error,
                )
            }
        }
    }
}

/** Section « Agendas abonnés (ICS) » de Réglages › Agendas. */
@Composable
private fun SubscribedCalendarsSection() {
    val context = LocalContext.current
    val repo = remember(context) { TasksGraph.calendarFeeds(context) }
    val feeds by repo.feeds.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val palette = cadence
    val defaultDotColor = palette.primary.hashCode()

    var offline by remember { mutableStateOf(false) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var addOpen by remember { mutableStateOf(false) }
    var toDelete by remember { mutableStateOf<CalendarFeed?>(null) }

    val offlineLabel = stringResource(R.string.calendars_ics_offline)
    val errorFallback = stringResource(R.string.calendars_ics_error)

    LaunchedEffect(repo) {
        offline = false
        actionError = null
        repo.refreshFeeds().onFailure { err ->
            if (isOfflineIcsError(err)) {
                offline = true
            }
        }
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            stringResource(R.string.calendars_ics_title),
            style = MaterialTheme.typography.titleMedium,
            color = palette.onSurface,
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = { addOpen = true }) {
            Text(stringResource(R.string.calendars_ics_add))
        }
    }

    if (offline) {
        Text(
            offlineLabel,
            style = MaterialTheme.typography.bodySmall,
            color = palette.onSurfaceVariant,
        )
    } else if (actionError != null) {
        Text(
            actionError.orEmpty(),
            style = MaterialTheme.typography.bodySmall,
            color = palette.error,
        )
    }

    val list = feeds.orEmpty()
    if (list.isEmpty() && !offline) {
        Text(
            stringResource(R.string.calendars_ics_empty),
            style = MaterialTheme.typography.bodyMedium,
            color = palette.onSurfaceVariant,
        )
    } else if (list.isNotEmpty()) {
        RowGroup {
            list.forEachIndexed { index, feed ->
                val dotColor = Color(CalendarFeedsClient.parseHexColor(feed.color, defaultDotColor))
                val subtitle = feed.lastError ?: feed.urlHost.takeIf { it.isNotBlank() }
                Surface(
                    color = palette.card,
                    shape = rowGroupShape(index, list.size),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = Space.md, vertical = Space.sm),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            Modifier
                                .size(12.dp)
                                .clip(CircleShape)
                                .background(dotColor),
                        )
                        Spacer(Modifier.width(Space.sm))
                        Column(Modifier.weight(1f)) {
                            Text(
                                feed.name,
                                style = MaterialTheme.typography.bodyLarge,
                                color = palette.onSurface,
                            )
                            if (subtitle != null) {
                                Text(
                                    subtitle,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (feed.lastError != null) palette.error else palette.onSurfaceVariant,
                                )
                            }
                        }
                        Switch(
                            checked = feed.showOnCalendar,
                            onCheckedChange = { checked ->
                                scope.launch {
                                    actionError = null
                                    repo.toggleFeed(feed.uid, checked).onFailure { err ->
                                        actionError = if (isOfflineIcsError(err)) offlineLabel else err.message ?: errorFallback
                                    }
                                }
                            },
                        )
                        Spacer(Modifier.width(Space.xs))
                        IconButton(onClick = { toDelete = feed }) {
                            Icon(
                                Icons.Outlined.DeleteOutline,
                                contentDescription = stringResource(R.string.calendars_ics_delete_confirm),
                                tint = palette.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }

    if (addOpen) {
        var name by remember { mutableStateOf("") }
        var url by remember { mutableStateOf("") }
        var saving by remember { mutableStateOf(false) }
        var formError by remember { mutableStateOf<String?>(null) }
        val missingFields = stringResource(R.string.calendars_ics_missing_fields)

        AlertDialog(
            onDismissRequest = { if (!saving) addOpen = false },
            title = { Text(stringResource(R.string.calendars_ics_add)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text(stringResource(R.string.calendars_ics_name_label)) },
                        singleLine = true,
                        enabled = !saving,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = url,
                        onValueChange = { url = it },
                        label = { Text(stringResource(R.string.calendars_ics_url_label)) },
                        singleLine = true,
                        enabled = !saving,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (formError != null) {
                        Text(
                            formError.orEmpty(),
                            style = MaterialTheme.typography.bodySmall,
                            color = palette.error,
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !saving,
                    onClick = {
                        if (name.isBlank() || url.isBlank()) {
                            formError = missingFields
                            return@TextButton
                        }
                        scope.launch {
                            saving = true
                            formError = null
                            repo.createFeed(name, url)
                                .onSuccess {
                                    offline = false
                                    addOpen = false
                                }
                                .onFailure { err ->
                                    formError = if (isOfflineIcsError(err)) {
                                        offlineLabel
                                    } else {
                                        err.message?.takeIf { it.isNotBlank() } ?: errorFallback
                                    }
                                }
                            saving = false
                        }
                    },
                ) {
                    Text(stringResource(R.string.calendars_ics_add_confirm))
                }
            },
            dismissButton = {
                TextButton(enabled = !saving, onClick = { addOpen = false }) {
                    Text(stringResource(R.string.calendars_ics_cancel))
                }
            },
        )
    }

    toDelete?.let { pending ->
        AlertDialog(
            onDismissRequest = { toDelete = null },
            title = { Text(stringResource(R.string.calendars_ics_delete_title)) },
            text = { Text(pending.name) },
            confirmButton = {
                TextButton(
                    onClick = {
                        toDelete = null
                        scope.launch {
                            actionError = null
                            repo.deleteFeed(pending.uid).onFailure { err ->
                                actionError = if (isOfflineIcsError(err)) offlineLabel else err.message ?: errorFallback
                            }
                        }
                    },
                ) {
                    Text(stringResource(R.string.calendars_ics_delete_confirm), color = palette.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { toDelete = null }) {
                    Text(stringResource(R.string.calendars_ics_cancel))
                }
            },
        )
    }
}

private fun isOfflineIcsError(t: Throwable): Boolean =
    t is NotConnected ||
        t is AuthError ||
        t is UnknownHostException ||
        t is ConnectException ||
        t is SocketTimeoutException ||
        (t is IOException && t.message?.startsWith("HTTP ") != true && t.message?.contains("connect", ignoreCase = true) == true)
