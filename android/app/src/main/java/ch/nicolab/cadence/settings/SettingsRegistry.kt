package ch.nicolab.cadence.settings

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Flight
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Widgets
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.HealthConnectUiState
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.health.HealthConnectSettingsPanel
import ch.nicolab.cadence.tasks.ui.settings.TududiConnectionSection

/** Rubriques de la page Réglages, dans l'ordre d'affichage. */
enum class SettingsSection(@StringRes val title: Int) {
    HOME_SCREEN(R.string.settings_section_home),
    ORGANISATION(R.string.settings_section_organisation),
    DATA(R.string.settings_data_title),
}

/** Une sous-page de Réglages : une ligne dans sa [section], puis son contenu. */
class SettingsPage(
    val id: String,
    val section: SettingsSection,
    val icon: ImageVector,
    @StringRes val title: Int,
    val subtitle: @Composable () -> String?,
    val content: @Composable () -> Unit,
)

/** Données et actions que Réglages reçoit de l'écran principal. */
internal class SettingsDeps(
    val groups: List<HabitGroup>,
    val habitCountByGroup: Map<String, Int>,
    val saveGroup: (HabitGroup) -> Unit,
    val addGroup: (String) -> Unit,
    val deleteGroup: (String) -> Unit,
    val moveGroup: (String, Int) -> Unit,
    val startTravel: () -> Unit,
    val export: () -> Unit,
    val import: () -> Unit,
    val message: String?,
    val healthConnectState: HealthConnectUiState,
    val hasDurationHabits: Boolean,
    val connectHealth: () -> Unit,
    val syncHealth: () -> Unit,
    val setHealthSyncEnabled: (Boolean) -> Unit,
    val manageHealthAccess: () -> Unit,
    val configureHealth: () -> Unit,
)

/** Seul point d'ajout d'une rubrique de Réglages : une entrée ici suffit à l'afficher. */
@Composable
internal fun settingsPages(deps: SettingsDeps): List<SettingsPage> = listOf(
    SettingsPage(
        id = "widgets",
        section = SettingsSection.HOME_SCREEN,
        icon = Icons.Outlined.Widgets,
        title = R.string.settings_page_widgets,
        subtitle = { null },
        content = {
            Panel {
                Text(stringResource(R.string.settings_widget_hint), style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface)
                Spacer(Modifier.height(Space.xs))
                Text(stringResource(R.string.settings_widget_options), style = MaterialTheme.typography.bodySmall, color = cadence.outline)
            }
        },
    ),
    SettingsPage(
        id = "groups",
        section = SettingsSection.ORGANISATION,
        icon = Icons.Outlined.Schedule,
        title = R.string.settings_page_groups,
        subtitle = { pluralStringResource(R.plurals.settings_groups_count, deps.groups.size, deps.groups.size) },
        content = {
            Panel {
                Text(stringResource(R.string.group_overlap_notice), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
            }
            deps.groups.forEach { group ->
                GroupPanel(group, deps.habitCountByGroup[group.id] ?: 0, deps.saveGroup, deps.deleteGroup, deps.moveGroup)
            }
            val newGroupName = stringResource(R.string.group_new_name)
            SecondaryAction(stringResource(R.string.group_add), Modifier.fillMaxWidth()) { deps.addGroup(newGroupName) }
        },
    ),
    SettingsPage(
        id = "travel",
        section = SettingsSection.ORGANISATION,
        icon = Icons.Outlined.Flight,
        title = R.string.travel_title,
        subtitle = { null },
        content = {
            Panel {
                Text(stringResource(R.string.travel_subtitle), style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface)
                Spacer(Modifier.height(Space.xs))
                Text(stringResource(R.string.travel_reminders_silent), style = MaterialTheme.typography.bodySmall, color = cadence.outline)
                Spacer(Modifier.height(Space.md))
                SecondaryAction(stringResource(R.string.travel_title), Modifier.fillMaxWidth(), onClick = deps.startTravel)
            }
        },
    ),
    SettingsPage(
        id = "health_connect",
        section = SettingsSection.ORGANISATION,
        icon = Icons.Outlined.FavoriteBorder,
        title = R.string.health_connect_title,
        subtitle = { null },
        content = {
            HealthConnectSettingsPanel(
                state = deps.healthConnectState,
                hasDurationHabits = deps.hasDurationHabits,
                connect = deps.connectHealth,
                sync = deps.syncHealth,
                setEnabled = deps.setHealthSyncEnabled,
                manageAccess = deps.manageHealthAccess,
                configure = deps.configureHealth,
            )
        },
    ),
    SettingsPage(
        id = "backup",
        section = SettingsSection.DATA,
        icon = Icons.Outlined.CloudUpload,
        title = R.string.settings_page_backup,
        subtitle = { null },
        content = {
            Panel {
                Text(stringResource(R.string.settings_data_subtitle), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
                Spacer(Modifier.height(Space.lg))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
                    PrimaryAction(stringResource(R.string.settings_export), Modifier.weight(1f), onClick = deps.export)
                    SecondaryAction(stringResource(R.string.settings_import), Modifier.weight(1f), onClick = deps.import)
                }
                deps.message?.let {
                    Spacer(Modifier.height(Space.md))
                    Text(it, style = MaterialTheme.typography.bodySmall, color = cadence.success)
                }
            }
        },
    ),
    SettingsPage(
        id = "tududi_account",
        section = SettingsSection.DATA,
        icon = Icons.Outlined.AccountCircle,
        title = R.string.settings_page_tududi,
        subtitle = { null },
        content = { Panel { TududiConnectionSection() } },
    ),
)
