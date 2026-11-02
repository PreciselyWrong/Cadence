package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.StickyNote2
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.components.ICON_CONTRAST
import ch.nicolab.cadence.designsystem.components.readableTintOf
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.PinnedShortcut

/**
 * Projets et notes épinglés, tout en haut de Tâches (comme en tête de la barre latérale du web) :
 * un appui ouvre, un appui long propose de désépingler.
 */
@Composable
internal fun PinnedStrip(
    shortcuts: List<PinnedShortcut>,
    onOpen: (PinnedShortcut) -> Unit,
    onUnpin: (PinnedShortcut) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (shortcuts.isEmpty()) return
    val label = stringResource(R.string.tasks_pinned_title)
    Row(
        modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = Space.gutter)
            .semantics { contentDescription = label },
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.PushPin, contentDescription = null, tint = cadence.onSurfaceVariant, modifier = Modifier.size(Size.iconSm))
        shortcuts.forEach { shortcut ->
            PinnedChip(shortcut, onOpen = { onOpen(shortcut) }, onUnpin = { onUnpin(shortcut) })
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PinnedChip(shortcut: PinnedShortcut, onOpen: () -> Unit, onUnpin: () -> Unit) {
    val palette = cadence
    var menu by remember { mutableStateOf(false) }
    val tint = projectRailColor(shortcut.color)?.let { readableTintOf(Color(it), palette.card, ICON_CONTRAST) } ?: palette.onSurfaceVariant
    Box {
        Row(
            Modifier
                .height(Size.tab)
                .widthIn(max = Size.pinnedChipMax)
                .clip(Radius.Pill)
                .background(palette.card)
                .combinedClickable(onClick = onOpen, onLongClick = { menu = true })
                .padding(horizontal = Space.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val icon = if (shortcut.kind == PinnedShortcut.Kind.NOTE) Icons.AutoMirrored.Outlined.StickyNote2 else entityIcon(shortcut.icon)
            if (icon != null) {
                EntityIcon(icon, tint = tint, size = Size.iconSm)
            } else {
                Box(Modifier.size(Space.sm).clip(CircleShape).background(tint))
            }
            Spacer(Modifier.width(Space.sm))
            Text(
                shortcut.name,
                style = MaterialTheme.typography.labelLarge,
                color = palette.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.tasks_action_unpin)) },
                leadingIcon = { Icon(Icons.Outlined.PushPin, contentDescription = null) },
                onClick = {
                    menu = false
                    onUnpin()
                },
            )
        }
    }
}
