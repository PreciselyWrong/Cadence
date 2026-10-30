@file:OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.EstimateFormat
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.RepeatType
import ch.nicolab.cadence.tasks.model.Repetition
import ch.nicolab.cadence.tasks.model.TagItem
import ch.nicolab.cadence.tasks.model.TaskPriority

internal fun priorityBadge(priority: Int): Int = when (priority) {
    TaskPriority.HIGH -> R.string.tasks_detail_badge_priority_high
    TaskPriority.MEDIUM -> R.string.tasks_detail_badge_priority_medium
    else -> R.string.tasks_detail_badge_priority_low
}

private val repeatChoices = listOf(RepeatType.NONE, RepeatType.DAILY, RepeatType.WEEKLY, RepeatType.MONTHLY)

/** Une option d'une feuille de choix ; [tint] colore la pastille de tête. */
internal data class SheetChoice<T>(val value: T, val label: String, val tint: Color? = null)

/** Feuille de choix unique : un geste applique et ferme. */
@Composable
internal fun <T> ChoiceSheet(
    title: String,
    choices: List<SheetChoice<T>>,
    selected: T,
    onSelect: (T) -> Unit,
    onDismiss: () -> Unit,
) {
    CadenceSheet(title = title, subtitle = null, dismiss = onDismiss) {
        Column(
            Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(Space.xs),
        ) {
            choices.forEach { choice ->
                OptionRow(
                    label = choice.label,
                    selected = choice.value == selected,
                    tint = choice.tint,
                    onClick = {
                        onSelect(choice.value)
                        onDismiss()
                    },
                )
            }
            Spacer(Modifier.size(Space.sm))
        }
    }
}

@Composable
internal fun ProjectSheet(
    projects: List<ProjectItem>,
    selectedUid: String?,
    onSelect: (String?) -> Unit,
    onDismiss: () -> Unit,
) {
    val choices = listOf(SheetChoice<String?>(null, stringResource(R.string.tasks_no_project))) +
        projects.map { SheetChoice<String?>(it.uid, it.name, projectRailColor(it.color)?.let(::Color)) }
    ChoiceSheet(
        title = stringResource(R.string.tasks_field_project),
        choices = choices,
        selected = selectedUid,
        onSelect = onSelect,
        onDismiss = onDismiss,
    )
}

@Composable
private fun OptionRow(label: String, selected: Boolean, tint: Color?, onClick: () -> Unit) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    Row(
        Modifier
            .fillMaxWidth()
            .clip(Radius.Control)
            .background(if (selected) palette.primaryContainer else palette.containerHigh)
            .semantics { this.selected = selected }
            .clickable(role = Role.RadioButton) {
                haptic.tap()
                onClick()
            }
            .heightIn(min = Size.touch)
            .padding(horizontal = Space.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        tint?.let {
            Box(Modifier.size(Space.md).clip(CircleShape).background(it))
            Spacer(Modifier.width(Space.md))
        }
        Text(
            label,
            Modifier.weight(1f),
            style = MaterialTheme.typography.bodyLarge,
            color = if (selected) palette.onPrimaryContainer else palette.onSurface,
        )
        if (selected) {
            Icon(Icons.Rounded.Check, null, tint = palette.primary, modifier = Modifier.size(Size.icon))
        }
    }
}

@Composable
internal fun RepetitionSheet(
    current: Repetition,
    hasDue: Boolean,
    onApply: (Repetition) -> Unit,
    onDismiss: () -> Unit,
) {
    var draft by remember { mutableStateOf(current) }
    CadenceSheet(title = stringResource(R.string.tasks_field_repeat), subtitle = null, dismiss = onDismiss) {
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.md)) {
            if (draft.type == RepeatType.OTHER) {
                // Une règle que l'appareil ne sait pas écrire reste telle quelle tant qu'on n'en choisit pas une autre.
                Text(
                    stringResource(R.string.tasks_repeat_custom),
                    style = MaterialTheme.typography.bodyMedium,
                    color = cadence.onSurfaceVariant,
                )
            }
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
                verticalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                repeatChoices.forEach { type ->
                    ChoiceChip(
                        label = repeatLabel(Repetition(type, 1)),
                        selected = draft.type == type,
                    ) { draft = Repetition(type, 1) }
                }
            }
            if (draft.type != RepeatType.NONE && draft.type != RepeatType.OTHER) {
                IntervalStepper(draft) { draft = it }
                if (!hasDue) {
                    Text(
                        stringResource(R.string.tasks_repeat_needs_due),
                        style = MaterialTheme.typography.bodyMedium,
                        color = cadence.onSurfaceVariant,
                    )
                }
            }
            PrimaryAction(
                label = stringResource(R.string.tasks_detail_validate),
                modifier = Modifier.fillMaxWidth(),
            ) {
                onApply(draft)
                onDismiss()
            }
        }
    }
}

@Composable
private fun IntervalStepper(repetition: Repetition, onChange: (Repetition) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
        Text(
            stringResource(R.string.tasks_repeat_every),
            style = MaterialTheme.typography.bodyLarge,
            color = cadence.onSurface,
        )
        Spacer(Modifier.weight(1f))
        RoundHeaderButton(
            icon = Icons.Outlined.Remove,
            contentDescription = stringResource(R.string.tasks_repeat_less),
        ) { onChange(repetition.copy(interval = (repetition.interval - 1).coerceAtLeast(1))) }
        Text(
            repeatLabel(repetition),
            style = MaterialTheme.typography.titleSmall,
            color = cadence.onSurface,
        )
        RoundHeaderButton(
            icon = Icons.Outlined.Add,
            contentDescription = stringResource(R.string.tasks_repeat_more),
        ) { onChange(repetition.copy(interval = repetition.interval + 1)) }
    }
}

@Composable
internal fun EstimateSheet(current: Int?, onSelect: (Int?) -> Unit, onDismiss: () -> Unit) {
    val presets = (EstimateFormat.presets + listOfNotNull(current)).distinct().sorted()
    CadenceSheet(title = stringResource(R.string.tasks_field_estimate), subtitle = null, dismiss = onDismiss) {
        FlowRow(
            Modifier.fillMaxWidth().padding(bottom = Space.md),
            horizontalArrangement = Arrangement.spacedBy(Space.sm),
            verticalArrangement = Arrangement.spacedBy(Space.sm),
        ) {
            ChoiceChip(label = stringResource(R.string.tasks_estimate_none), selected = current == null) {
                onSelect(null)
                onDismiss()
            }
            presets.forEach { minutes ->
                ChoiceChip(label = EstimateFormat.format(minutes), selected = current == minutes) {
                    onSelect(minutes)
                    onDismiss()
                }
            }
        }
    }
}

/** Étiquettes : chaque appui s'applique tout de suite, la feuille reste ouverte pour en cocher plusieurs. */
@Composable
internal fun TagsSheet(
    tags: List<TagItem>,
    selected: Set<String>,
    onChange: (Set<String>) -> Unit,
    onDismiss: () -> Unit,
) {
    var chosen by remember { mutableStateOf(selected) }
    CadenceSheet(title = stringResource(R.string.tasks_field_tags), subtitle = null, dismiss = onDismiss) {
        if (tags.isEmpty()) {
            Text(
                stringResource(R.string.tasks_detail_no_tags),
                Modifier.padding(bottom = Space.md),
                style = MaterialTheme.typography.bodyMedium,
                color = cadence.onSurfaceVariant,
            )
        } else {
            FlowRow(
                Modifier.fillMaxWidth().padding(bottom = Space.md),
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
                verticalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                tags.forEach { tag ->
                    ChoiceChip(label = "#" + tag.name, selected = tag.uid in chosen) {
                        chosen = if (tag.uid in chosen) chosen - tag.uid else chosen + tag.uid
                        onChange(chosen)
                    }
                }
            }
        }
    }
}
