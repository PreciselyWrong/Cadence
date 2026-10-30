package ch.nicolab.cadence

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.ErrorText
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.PauseReason
import java.time.LocalDate

/** Libellé français d'un motif de pause. */
@Composable
internal fun pauseReasonLabel(reason: PauseReason?, custom: String?): String = when (reason) {
    PauseReason.REST -> stringResource(R.string.skip_reason_rest)
    PauseReason.ILLNESS -> stringResource(R.string.skip_reason_illness)
    PauseReason.TRAVEL -> stringResource(R.string.skip_reason_travel)
    PauseReason.CUSTOM -> custom.orEmpty().ifBlank { stringResource(R.string.skip_reason_custom) }
    PauseReason.MANUAL, null -> stringResource(R.string.skip_reason_manual)
}

/**
 * Choix du motif d'un saut. Le saut ne valide pas l'habitude et ne casse pas la série;
 * il reste annulable le jour même depuis les options de l'habitude.
 */
@OptIn(ExperimentalLayoutApi::class, androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun SkipSheet(
    accent: Color,
    dismiss: () -> Unit,
    confirm: (PauseReason, String?) -> Unit,
) {
    val palette = cadence
    var reason by remember { mutableStateOf(PauseReason.REST) }
    var custom by remember { mutableStateOf("") }
    val offered = listOf(PauseReason.REST, PauseReason.ILLNESS, PauseReason.TRAVEL, PauseReason.CUSTOM)

    CadenceSheet(
        title = stringResource(R.string.skip_sheet_title),
        subtitle = stringResource(R.string.skip_sheet_subtitle),
        dismiss = dismiss,
    ) {
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(Space.sm),
            verticalArrangement = Arrangement.spacedBy(Space.sm),
        ) {
            offered.forEach { candidate ->
                ChoiceChip(pauseReasonLabel(candidate, null), reason == candidate, accent = accent) {
                    reason = candidate
                }
            }
        }
        if (reason == PauseReason.CUSTOM) {
            Spacer(Modifier.height(Space.md))
            CadenceField(custom, { custom = it }, stringResource(R.string.skip_custom_label), accent = accent)
        }
        Spacer(Modifier.height(Space.md))
        Text(
            stringResource(R.string.skip_notice),
            style = MaterialTheme.typography.bodySmall,
            color = palette.outline,
        )
        Spacer(Modifier.height(Space.xl))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
            SecondaryAction(stringResource(R.string.form_btn_cancel), Modifier.weight(1f), onClick = dismiss)
            PrimaryAction(
                stringResource(R.string.skip_confirm),
                Modifier.weight(1f),
                accent = accent,
                enabled = reason != PauseReason.CUSTOM || custom.isNotBlank(),
            ) {
                confirm(reason, custom.takeIf { reason == PauseReason.CUSTOM })
            }
        }
    }
}

/**
 * Suspension de plusieurs habitudes entre deux dates. La sélection par groupe évite de
 * cocher une à une; la plage est inclusive, son dernier jour reste suspendu.
 */
@OptIn(ExperimentalLayoutApi::class, androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun TravelSheet(
    habits: List<HabitCardState>,
    groups: List<HabitGroup>,
    today: LocalDate,
    dismiss: () -> Unit,
    start: (List<String>, LocalDate, LocalDate) -> Unit,
) {
    val palette = cadence
    val accent = palette.primary
    val selectable = habits.filterNot { it.stored.archived }
    var selected by remember { mutableStateOf(emptySet<String>()) }
    var from by remember { mutableStateOf(today.toString()) }
    var to by remember { mutableStateOf(today.plusDays(6).toString()) }
    var error by remember { mutableStateOf<String?>(null) }
    val badRange = stringResource(R.string.travel_error_range)
    val emptySelection = stringResource(R.string.travel_error_empty)

    CadenceSheet(
        title = stringResource(R.string.travel_title),
        subtitle = stringResource(R.string.travel_subtitle),
        dismiss = dismiss,
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
            CadenceField(from, { from = it }, stringResource(R.string.travel_from_label), Modifier.weight(1f), accent = accent)
            CadenceField(to, { to = it }, stringResource(R.string.travel_to_label), Modifier.weight(1f), accent = accent)
        }
        Spacer(Modifier.height(Space.md))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            ChoiceChip(
                stringResource(R.string.travel_select_all),
                selected.size == selectable.size && selectable.isNotEmpty(),
                accent = accent,
            ) {
                selected = if (selected.size == selectable.size) emptySet()
                else selectable.map { it.stored.id }.toSet()
            }
            groups.forEach { group ->
                val ids = selectable.filter { it.stored.groupId == group.id }.map { it.stored.id }.toSet()
                if (ids.isNotEmpty()) {
                    ChoiceChip(
                        stringResource(R.string.travel_select_group, group.name),
                        ids.isNotEmpty() && selected.containsAll(ids),
                        accent = accent,
                    ) {
                        selected = if (selected.containsAll(ids)) selected - ids else selected + ids
                    }
                }
            }
        }
        Spacer(Modifier.height(Space.md))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            selectable.forEach { habit ->
                ChoiceChip(habit.stored.name, habit.stored.id in selected, accent = accent) {
                    selected = if (habit.stored.id in selected) selected - habit.stored.id
                    else selected + habit.stored.id
                }
            }
        }
        Spacer(Modifier.height(Space.md))
        Text(
            stringResource(R.string.travel_reminders_silent),
            style = MaterialTheme.typography.bodySmall,
            color = palette.outline,
        )
        error?.let { Spacer(Modifier.height(Space.md)); ErrorText(it) }
        Spacer(Modifier.height(Space.xl))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
            SecondaryAction(stringResource(R.string.form_btn_cancel), Modifier.weight(1f), onClick = dismiss)
            PrimaryAction(stringResource(R.string.travel_start), Modifier.weight(1f), accent = accent) {
                val parsedFrom = runCatching { LocalDate.parse(from.trim()) }.getOrNull()
                val parsedTo = runCatching { LocalDate.parse(to.trim()) }.getOrNull()
                when {
                    selected.isEmpty() -> error = emptySelection
                    parsedFrom == null || parsedTo == null || parsedTo < parsedFrom -> error = badRange
                    else -> start(selected.toList(), parsedFrom, parsedTo)
                }
            }
        }
    }
}
