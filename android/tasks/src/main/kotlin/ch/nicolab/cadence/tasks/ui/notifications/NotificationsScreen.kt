@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui.notifications

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.live.CenterNotification
import ch.nicolab.cadence.tasks.live.NotificationCenter
import ch.nicolab.cadence.tasks.live.NotificationTarget
import ch.nicolab.cadence.tasks.live.NotificationTargets
import ch.nicolab.cadence.tasks.model.SyncStatusText
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * Écran « Notifications » : celles des agents et du classement, lues et non lues, la plus récente d'abord. Un toucher
 * marque la notification lue et ouvre sa cible ([NotificationTargets]) ; « Tout marquer comme lu » vide le compteur.
 * En ligne seulement ; rien n'est gardé sur le téléphone.
 */
@Composable
fun NotificationsScreen(onBack: () -> Unit, onOpen: (NotificationTarget) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val offline = stringResource(R.string.notifications_offline)
    val failed = stringResource(R.string.notifications_error)
    var entries by remember { mutableStateOf<List<CenterNotification>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        try {
            entries = NotificationCenter.list(context)
            loadError = null
        } catch (error: CancellationException) {
            throw error
        } catch (error: IOException) {
            loadError = offline
        } catch (error: Exception) {
            loadError = failed
        }
        loaded = true
    }

    LaunchedEffect(Unit) { load() }
    BackHandler(onBack = onBack)

    fun open(item: CenterNotification) {
        if (!item.read) {
            entries = entries.map { if (it.uid == item.uid) it.copy(read = true) else it }
            scope.launch {
                if (!NotificationCenter.markRead(context, item.uid)) {
                    entries = entries.map { if (it.uid == item.uid) it.copy(read = false) else it }
                }
            }
        }
        onOpen(NotificationTargets.of(item.payload))
    }

    val palette = cadence
    val now = Instant.now()
    Surface(Modifier.fillMaxSize(), color = palette.background, contentColor = palette.onSurface) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            Column(Modifier.padding(horizontal = Space.gutter)) {
                ScreenHeader(
                    title = stringResource(R.string.notifications_title),
                    onBack = onBack,
                    backDescription = stringResource(R.string.tasks_back),
                )
            }
            if (entries.any { !it.read }) {
                TertiaryAction(
                    stringResource(R.string.notifications_read_all),
                    Modifier.padding(horizontal = Space.gutter - Space.sm),
                ) {
                    scope.launch {
                        if (NotificationCenter.markAllRead(context)) entries = entries.map { it.copy(read = true) }
                    }
                }
            }
            LazyColumn(
                Modifier.weight(1f),
                contentPadding = PaddingValues(horizontal = Space.gutter, vertical = Space.sm),
                verticalArrangement = Arrangement.spacedBy(Space.xs),
            ) {
                if (!loaded) {
                    item(key = "loading") { Text(stringResource(R.string.proposal_loading), style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant) }
                    return@LazyColumn
                }
                loadError?.let { message ->
                    item(key = "error") {
                        Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                            Text(message, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
                            SecondaryAction(stringResource(R.string.notifications_retry)) {
                                loaded = false
                                scope.launch { load() }
                            }
                        }
                    }
                }
                if (entries.isEmpty() && loadError == null) {
                    item(key = "empty") {
                        Text(
                            stringResource(R.string.notifications_empty),
                            style = MaterialTheme.typography.titleMedium,
                            color = palette.onSurfaceVariant,
                            modifier = Modifier.fillMaxWidth().padding(vertical = Space.lg),
                        )
                    }
                }
                items(entries, key = { it.uid }) { item ->
                    NotificationRow(item, now) { open(item) }
                }
            }
        }
    }
}

@Composable
private fun NotificationRow(item: CenterNotification, now: Instant, onClick: () -> Unit) {
    val palette = cadence
    val created = runCatching { Instant.parse(item.createdAt) }.getOrNull()
    Row(
        Modifier
            .fillMaxWidth()
            .background(if (item.read) palette.surface else palette.primaryContainer, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = Space.md, vertical = Space.sm),
        verticalAlignment = Alignment.Top,
    ) {
        Box(Modifier.padding(top = 6.dp).size(8.dp).background(if (item.read) palette.surface else palette.primary, CircleShape))
        Spacer(Modifier.width(Space.sm))
        Column(Modifier.weight(1f)) {
            item.agentLabel?.let {
                Text(it, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = palette.primary)
            }
            Text(
                item.title,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (item.read) FontWeight.Normal else FontWeight.SemiBold,
                color = palette.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (item.message.isNotBlank()) {
                Text(
                    item.message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            created?.let {
                Text(SyncStatusText.ago(it, now), style = MaterialTheme.typography.labelSmall, color = palette.onSurfaceVariant)
            }
        }
    }
}
