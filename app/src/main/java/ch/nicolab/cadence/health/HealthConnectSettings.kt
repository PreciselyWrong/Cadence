package ch.nicolab.cadence.health

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.HealthConnectSourceOption
import ch.nicolab.cadence.HealthConnectUiState
import ch.nicolab.cadence.HabitCardState
import ch.nicolab.cadence.R
import ch.nicolab.cadence.domain.HealthConnectRule
import ch.nicolab.cadence.ui.components.CadenceSheet
import ch.nicolab.cadence.ui.components.ChoiceChip
import ch.nicolab.cadence.ui.components.ErrorText
import ch.nicolab.cadence.ui.components.Panel
import ch.nicolab.cadence.ui.components.PrimaryAction
import ch.nicolab.cadence.ui.components.SecondaryAction
import ch.nicolab.cadence.ui.components.TertiaryAction
import ch.nicolab.cadence.ui.components.ToggleRow
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence

@Composable
fun HealthConnectSettingsPanel(
    state: HealthConnectUiState,
    hasDurationHabits: Boolean,
    connect: () -> Unit,
    sync: () -> Unit,
    setEnabled: (Boolean) -> Unit,
    manageAccess: () -> Unit,
    configure: () -> Unit,
) {
    val palette = cadence
    Panel {
        Text(stringResource(R.string.health_connect_summary), style = MaterialTheme.typography.bodyLarge, color = palette.ink)
        Spacer(Modifier.height(Space.xs))
        val status = when {
            state.availability == HealthConnectAvailability.UNAVAILABLE -> R.string.health_connect_unavailable
            state.availability == HealthConnectAvailability.UPDATE_REQUIRED -> R.string.health_connect_update_required
            !state.permissionGranted -> R.string.health_connect_permission_needed
            state.syncEnabled -> R.string.health_connect_connected
            else -> R.string.health_connect_paused
        }
        Text(stringResource(status), style = MaterialTheme.typography.bodySmall, color = palette.inkMuted)
        when {
            state.failed -> {
                Spacer(Modifier.height(Space.sm))
                ErrorText(stringResource(R.string.health_connect_sync_failed))
            }
            state.lastImportedCount != null && state.permissionGranted -> {
                Spacer(Modifier.height(Space.sm))
                val resultText = when (state.lastImportedCount) {
                    0 -> stringResource(R.string.health_connect_sync_result_zero)
                    1 -> stringResource(R.string.health_connect_sync_result_one)
                    else -> stringResource(R.string.health_connect_sync_result_many, state.lastImportedCount)
                }
                Text(
                    resultText,
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.success,
                )
            }
        }
        Spacer(Modifier.height(Space.lg))
        when {
            state.availability != HealthConnectAvailability.AVAILABLE -> Unit
            !state.permissionGranted -> PrimaryAction(stringResource(R.string.health_connect_connect), Modifier.fillMaxWidth(), onClick = connect)
            else -> {
                PrimaryAction(
                    stringResource(if (state.syncing) R.string.health_connect_syncing else R.string.health_connect_sync),
                    Modifier.fillMaxWidth(),
                    enabled = state.syncEnabled && !state.syncing,
                    onClick = sync,
                )
                Spacer(Modifier.height(Space.sm))
                if (hasDurationHabits) {
                    SecondaryAction(stringResource(R.string.health_connect_configure), Modifier.fillMaxWidth(), onClick = configure)
                    Spacer(Modifier.height(Space.sm))
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                    SecondaryAction(
                        stringResource(if (state.syncEnabled) R.string.health_connect_pause else R.string.health_connect_resume),
                        Modifier.weight(1f),
                    ) { setEnabled(!state.syncEnabled) }
                    SecondaryAction(stringResource(R.string.health_connect_manage), Modifier.weight(1f), onClick = manageAccess)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun HealthConnectRulesSheet(
    habits: List<HabitCardState>,
    rules: List<HealthConnectRule>,
    sources: List<HealthConnectSourceOption>,
    dismiss: () -> Unit,
    save: (HealthConnectRule) -> Unit,
    delete: (String) -> Unit,
) {
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    val habit = habits.firstOrNull { it.stored.id == selectedId }
    val existing = rules.firstOrNull { it.habitId == selectedId }
    CadenceSheet(
        title = habit?.stored?.name ?: stringResource(R.string.health_connect_rules_title),
        subtitle = stringResource(R.string.health_connect_rules_subtitle),
        dismiss = dismiss,
    ) {
        if (habit == null) {
            Column(
                Modifier.fillMaxWidth().heightIn(max = Size.sheetContent).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(Space.md),
            ) {
                if (habits.isEmpty()) {
                    Text(stringResource(R.string.health_connect_no_duration_habit), color = cadence.inkMuted)
                }
                habits.forEach { item ->
                    val rule = rules.firstOrNull { it.habitId == item.stored.id }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
                        Column(Modifier.weight(1f)) {
                            Text(item.stored.name, style = MaterialTheme.typography.titleMedium, color = cadence.ink)
                            Text(
                                rule?.let { stringResource(R.string.health_connect_rule_types_count, it.exerciseTypes.size) }
                                    ?: stringResource(R.string.health_connect_rule_none),
                                style = MaterialTheme.typography.bodySmall,
                                color = cadence.inkMuted,
                            )
                        }
                        SecondaryAction(stringResource(R.string.health_connect_rule_edit)) { selectedId = item.stored.id }
                    }
                }
            }
        } else {
            HealthConnectRuleEditor(
                habitId = habit.stored.id,
                existing = existing,
                sources = sources,
                back = { selectedId = null },
                save = { save(it); selectedId = null },
                delete = existing?.let { { delete(it.habitId); selectedId = null } },
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun HealthConnectRuleEditor(
    habitId: String,
    existing: HealthConnectRule?,
    sources: List<HealthConnectSourceOption>,
    back: () -> Unit,
    save: (HealthConnectRule) -> Unit,
    delete: (() -> Unit)?,
) {
    var enabled by remember(habitId, existing) { mutableStateOf(existing?.enabled ?: true) }
    var selectedTypes by remember(habitId, existing) { mutableStateOf(existing?.exerciseTypes ?: emptySet()) }
    var source by remember(habitId, existing) { mutableStateOf(existing?.dataOriginPackage) }
    var attempted by remember(habitId) { mutableStateOf(false) }
    val sourceChoices = remember(sources, existing) {
        val currentPackage = existing?.dataOriginPackage
        if (currentPackage != null && sources.none { it.packageName == currentPackage }) {
            sources + HealthConnectSourceOption(currentPackage, currentPackage)
        } else sources
    }

    Column(
        Modifier.fillMaxWidth().heightIn(max = Size.sheetContent).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(Space.lg),
    ) {
        ToggleRow(stringResource(R.string.health_connect_rule_enabled), enabled) { enabled = it }
        Text(stringResource(R.string.health_connect_rule_types), style = MaterialTheme.typography.labelLarge, color = cadence.inkMuted)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            HealthExerciseCatalog.types.forEach { type ->
                ChoiceChip(stringResource(type.label), type.value in selectedTypes) {
                    selectedTypes = if (type.value in selectedTypes) selectedTypes - type.value else selectedTypes + type.value
                }
            }
        }
        if (attempted && selectedTypes.isEmpty()) ErrorText(stringResource(R.string.health_connect_rule_choose_type))
        Text(stringResource(R.string.health_connect_rule_source), style = MaterialTheme.typography.labelLarge, color = cadence.inkMuted)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            ChoiceChip(stringResource(R.string.health_connect_rule_all_sources), source == null) { source = null }
            sourceChoices.forEach { option ->
                ChoiceChip(
                    option.label,
                    source == option.packageName,
                ) { source = option.packageName }
            }
        }
    }
    Spacer(Modifier.height(Space.lg))
    PrimaryAction(stringResource(R.string.health_connect_rule_save), Modifier.fillMaxWidth()) {
        attempted = true
        if (selectedTypes.isNotEmpty()) save(HealthConnectRule(habitId, selectedTypes, source, enabled))
    }
    Spacer(Modifier.height(Space.xs))
    delete?.let {
        TertiaryAction(stringResource(R.string.health_connect_rule_delete), Modifier.fillMaxWidth(), tint = cadence.danger, onClick = it)
    }
    TertiaryAction(stringResource(R.string.form_btn_cancel), Modifier.fillMaxWidth(), onClick = back)
}
