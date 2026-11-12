@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Label
import androidx.compose.material.icons.automirrored.outlined.StickyNote2
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Extension
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.ICON_CONTRAST
import ch.nicolab.cadence.designsystem.components.readableTintOf
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.AreaFilter
import ch.nicolab.cadence.tasks.model.AreaItem
import ch.nicolab.cadence.tasks.model.PinnedShortcut
import ch.nicolab.cadence.tasks.plugins.PluginMenuItem

/**
 * Sélecteur de liste, ouvert par le titre de Tâches : il remplace les rangées de pastilles (épinglés, onglets,
 * domaines). Les épinglés d'abord, comme en tête de la barre latérale du web, puis les listes, le domaine, les pages
 * des plugins actifs et Réglages.
 */
@Composable
internal fun ListSwitcherSheet(
    current: TasksTab,
    todayCount: Int,
    pinned: List<PinnedShortcut>,
    areas: List<AreaItem>,
    areaFilter: String?,
    withLink: Boolean,
    onSelectTab: (TasksTab) -> Unit,
    onOpenPinned: (PinnedShortcut) -> Unit,
    onUnpin: (PinnedShortcut) -> Unit,
    onSelectArea: (String?) -> Unit,
    onSelectWithLink: (Boolean) -> Unit,
    onOpenMyDay: () -> Unit,
    onOpenSettings: () -> Unit,
    onDismiss: () -> Unit,
    plugins: List<PluginMenuItem> = emptyList(),
    onOpenPlugin: (PluginMenuItem) -> Unit = {},
) {
    val palette = cadence
    CadenceSheet(title = stringResource(R.string.tasks_lists_title), subtitle = null, dismiss = onDismiss) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(bottom = Space.lg)) {
            if (pinned.isNotEmpty()) {
                SheetLabel(stringResource(R.string.tasks_pinned_title))
                pinned.forEach { shortcut ->
                    var menu by remember { mutableStateOf(false) }
                    Box {
                        SwitcherRow(
                            label = shortcut.name,
                            leading = { PinnedIcon(shortcut) },
                            onClick = { onOpenPinned(shortcut) },
                            onLongClick = { menu = true },
                        )
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.tasks_action_unpin)) },
                                leadingIcon = { Icon(Icons.Outlined.PushPin, contentDescription = null) },
                                onClick = {
                                    menu = false
                                    onUnpin(shortcut)
                                },
                            )
                        }
                    }
                }
                HorizontalDivider(Modifier.padding(vertical = Space.sm), color = palette.outlineVariant)
            }
            LIST_ENTRIES.forEach { (tab, icon) ->
                SwitcherRow(
                    label = stringResource(tab.label),
                    leading = { Icon(icon, contentDescription = null, tint = palette.onSurfaceVariant, modifier = Modifier.size(Size.icon)) },
                    count = if (tab == TasksTab.TODAY) todayCount.takeIf { it > 0 } else null,
                    selected = tab == current,
                    onClick = { onSelectTab(tab) },
                )
            }
            if (AreaFilter.offersChoice(areas)) {
                HorizontalDivider(Modifier.padding(vertical = Space.sm), color = palette.outlineVariant)
                SheetLabel(stringResource(R.string.tasks_lists_area))
                AreaFilterRow(areas = areas, selected = areaFilter, onSelect = onSelectArea, contentPadding = PaddingValues())
            }
            Row(Modifier.padding(vertical = Space.sm)) {
                ChoiceChip(
                    label = stringResource(R.string.tasks_filter_with_link),
                    selected = withLink,
                    onClick = { onSelectWithLink(!withLink) },
                )
            }
            SwitcherRow(
                label = stringResource(R.string.brief_card_title),
                leading = { Icon(Icons.Outlined.Today, contentDescription = null, tint = palette.onSurfaceVariant) },
                onClick = onOpenMyDay,
            )
            if (plugins.isNotEmpty()) {
                HorizontalDivider(Modifier.padding(vertical = Space.sm), color = palette.outlineVariant)
                SheetLabel(stringResource(R.string.plugins_title))
                plugins.forEach { item ->
                    SwitcherRow(
                        label = item.label,
                        leading = { Icon(Icons.Outlined.Extension, contentDescription = null, tint = palette.onSurfaceVariant, modifier = Modifier.size(Size.icon)) },
                        onClick = { onOpenPlugin(item) },
                    )
                }
            }
            HorizontalDivider(Modifier.padding(vertical = Space.sm), color = palette.outlineVariant)
            SwitcherRow(
                label = stringResource(R.string.tasks_open_settings),
                leading = { Icon(Icons.Outlined.Settings, contentDescription = null, tint = palette.onSurfaceVariant, modifier = Modifier.size(Size.icon)) },
                onClick = onOpenSettings,
            )
        }
    }
}

/** Listes du sélecteur, dans l'ordre ; Objectifs vit dans Bilan, pas ici. */
private val LIST_ENTRIES: List<Pair<TasksTab, ImageVector>> = listOf(
    TasksTab.TODAY to Icons.Outlined.WbSunny,
    TasksTab.UPCOMING to Icons.Outlined.CalendarMonth,
    TasksTab.PROJECTS to Icons.Outlined.Folder,
    TasksTab.TAGS to Icons.AutoMirrored.Outlined.Label,
    TasksTab.NOTES to Icons.AutoMirrored.Outlined.StickyNote2,
    TasksTab.DONE to Icons.Outlined.TaskAlt,
)

@Composable
private fun SheetLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = cadence.onSurfaceVariant,
        modifier = Modifier.padding(top = Space.xs, bottom = Space.xs),
    )
}

@Composable
private fun PinnedIcon(shortcut: PinnedShortcut) {
    val palette = cadence
    val tint = projectRailColor(shortcut.color)?.let { readableTintOf(Color(it), palette.card, ICON_CONTRAST) } ?: palette.onSurfaceVariant
    val icon = if (shortcut.kind == PinnedShortcut.Kind.NOTE) Icons.AutoMirrored.Outlined.StickyNote2 else entityIcon(shortcut.icon)
    if (icon != null) {
        EntityIcon(icon, tint = tint)
    } else {
        Box(Modifier.size(Size.icon), contentAlignment = Alignment.Center) {
            Box(Modifier.size(Space.md).clip(CircleShape).background(tint))
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SwitcherRow(
    label: String,
    leading: @Composable () -> Unit,
    onClick: () -> Unit,
    count: Int? = null,
    selected: Boolean = false,
    onLongClick: (() -> Unit)? = null,
) {
    val palette = cadence
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = Size.touch)
            .clip(Radius.Control)
            .background(if (selected) palette.containerHigh else Color.Transparent)
            .combinedClickable(role = Role.Button, onClick = onClick, onLongClick = onLongClick)
            .semantics { this.selected = selected }
            .padding(horizontal = Space.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leading()
        Spacer(Modifier.width(Space.lg))
        Text(
            label,
            style = MaterialTheme.typography.bodyLarge,
            color = palette.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        count?.let {
            Text(it.toString(), style = MaterialTheme.typography.labelLarge, color = palette.onSurfaceVariant)
        }
    }
}
