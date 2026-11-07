package ch.nicolab.cadence.tasks.ui.triage

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.autoclassify.AutoClassifyChoices
import ch.nicolab.cadence.tasks.autoclassify.ClassifyAnswer
import ch.nicolab.cadence.tasks.autoclassify.ClassifyCard
import ch.nicolab.cadence.tasks.autoclassify.DuplicateCard
import ch.nicolab.cadence.tasks.autoclassify.ProjectAnswer
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.ui.ProjectSheet
import kotlinx.serialization.json.JsonElement

/**
 * Carte « classement » : une ligne par ce qui est proposé (projet, tags, priorité), réglable avant « Appliquer ».
 * « Tout accepter » envoie `all` (ce que le serveur fait déjà pour la notification) ; « Aucun » classe la suggestion
 * sans rien changer.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ClassifyCardView(
    card: ClassifyCard,
    projects: List<ProjectItem>,
    onAnswer: (JsonElement) -> Unit,
    onDismiss: () -> Unit,
    onSkip: () -> Unit,
) {
    val defaults = remember(card) { AutoClassifyChoices.defaultAnswer(card) }
    var project by remember(card) { mutableStateOf(defaults.project) }
    var newName by remember(card) { mutableStateOf(card.project?.newProject?.name.orEmpty()) }
    var checked by remember(card) { mutableStateOf(defaults.tags.toSet()) }
    var newTagChecked by remember(card) { mutableStateOf(false) }
    var priority by remember(card) { mutableStateOf(card.priority) }
    var pickingProject by remember(card) { mutableStateOf(false) }
    val offer = card.project
    val chosenName = (project as? ProjectAnswer.Existing)?.let { existing ->
        projects.firstOrNull { it.uid == existing.uid }?.name
    }
    val canApply = project !is ProjectAnswer.NewProject || newName.isNotBlank()

    Panel(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            Text(card.title, style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
        }
    }
    if (offer != null) {
        SectionLabel(stringResource(R.string.auto_classify_project_row))
        offer.options.forEach { option ->
            ChoiceRow(
                label = listOfNotNull(option.name, option.areaName).joinToString(" · "),
                selected = project == ProjectAnswer.Existing(option.uid),
            ) { project = ProjectAnswer.Existing(option.uid) }
        }
        offer.area?.let { area ->
            ChoiceRow(
                label = stringResource(R.string.auto_classify_area, area.name.orEmpty()),
                selected = project == ProjectAnswer.Area(area.uid),
            ) { project = ProjectAnswer.Area(area.uid) }
        }
        offer.newProject?.let { created ->
            ChoiceRow(
                label = stringResource(R.string.auto_classify_new_project),
                selected = project is ProjectAnswer.NewProject,
            ) { project = ProjectAnswer.NewProject(newName, created.areaUid) }
            if (project is ProjectAnswer.NewProject) {
                CadenceField(
                    value = newName,
                    onValue = {
                        newName = it
                        project = ProjectAnswer.NewProject(it, created.areaUid)
                    },
                    label = stringResource(R.string.auto_classify_new_project_name),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        ChoiceRow(label = stringResource(R.string.auto_classify_no_project), selected = project == ProjectAnswer.None) {
            project = ProjectAnswer.None
        }
        ChoiceRow(
            label = chosenName ?: stringResource(R.string.auto_classify_other_project),
            selected = chosenName != null,
        ) { pickingProject = true }
    }
    card.tags?.let { tags ->
        SectionLabel(stringResource(R.string.auto_classify_tags_row))
        tags.options.forEach { name ->
            CheckRow(label = "#$name", checked = name in checked) {
                checked = if (name in checked) checked - name else checked + name
            }
        }
        tags.newTag?.let { name ->
            CheckRow(label = stringResource(R.string.auto_classify_new_tag, name), checked = newTagChecked) {
                newTagChecked = !newTagChecked
            }
        }
    }
    if (card.priority != null) {
        SectionLabel(stringResource(R.string.auto_classify_priority_row))
        ChoiceRow(label = stringResource(R.string.auto_classify_priority_unchanged), selected = priority == null) { priority = null }
        ChoiceRow(label = stringResource(R.string.auto_classify_priority_medium), selected = priority == 1) { priority = 1 }
        ChoiceRow(label = stringResource(R.string.auto_classify_priority_high), selected = priority == 2) { priority = 2 }
    }

    PrimaryAction(stringResource(R.string.auto_classify_apply), Modifier.fillMaxWidth(), enabled = canApply) {
        val answer = ClassifyAnswer(
            project = if (offer == null) ProjectAnswer.None else project,
            tags = card.tags?.options.orEmpty().filter { it in checked },
            newTag = card.tags?.newTag?.takeIf { newTagChecked },
            priority = priority,
        )
        onAnswer(AutoClassifyChoices.answer(answer))
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        SecondaryAction(stringResource(R.string.auto_classify_accept_all)) { onAnswer(AutoClassifyChoices.ACCEPT_ALL) }
        SecondaryAction(stringResource(R.string.auto_classify_dismiss), onClick = onDismiss)
        TertiaryAction(stringResource(R.string.triage_skip), onClick = onSkip)
    }

    if (pickingProject) {
        ProjectSheet(
            projects = projects,
            selectedUid = (project as? ProjectAnswer.Existing)?.uid,
            onSelect = { uid ->
                project = uid?.let { ProjectAnswer.Existing(it) } ?: ProjectAnswer.None
                pickingProject = false
            },
            onDismiss = { pickingProject = false },
        )
    }
}

/** Carte de doublon : les deux liens côte à côte, puis les quatre réponses du serveur. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun DuplicateCardView(
    card: DuplicateCard,
    onAnswer: (JsonElement) -> Unit,
    onSkip: () -> Unit,
) {
    Panel(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            Text(stringResource(R.string.auto_classify_duplicate_title), style = MaterialTheme.typography.labelMedium, color = cadence.onSurfaceVariant)
            Text(card.title.ifBlank { card.url }, style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
            Text(stringResource(reasonLabel(card.reason)), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
            Text(
                stringResource(R.string.auto_classify_new_link) + " · " + card.url,
                style = MaterialTheme.typography.bodySmall,
                color = cadence.onSurface,
            )
            Text(
                stringResource(R.string.auto_classify_original_link) + " · " + card.original.title.ifBlank { card.original.url },
                style = MaterialTheme.typography.bodySmall,
                color = cadence.onSurface,
            )
            Text(card.original.url, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
        }
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        SecondaryAction(stringResource(R.string.auto_classify_dup_drop)) { onAnswer(AutoClassifyChoices.duplicate("drop_new")) }
        SecondaryAction(stringResource(R.string.auto_classify_dup_merge)) { onAnswer(AutoClassifyChoices.duplicate("merge")) }
        SecondaryAction(stringResource(R.string.auto_classify_dup_keep_new)) { onAnswer(AutoClassifyChoices.duplicate("keep_new")) }
        SecondaryAction(stringResource(R.string.auto_classify_dup_keep_both)) { onAnswer(AutoClassifyChoices.duplicate("keep_both")) }
        TertiaryAction(stringResource(R.string.triage_skip), onClick = onSkip)
    }
}

private fun reasonLabel(reason: String): Int = when (reason) {
    "address" -> R.string.auto_classify_reason_address
    "repository" -> R.string.auto_classify_reason_repository
    "video" -> R.string.auto_classify_reason_video
    "title" -> R.string.auto_classify_reason_title
    else -> R.string.auto_classify_reason_other
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = cadence.onSurfaceVariant,
        modifier = Modifier.padding(top = Space.sm),
    )
}

@Composable
private fun ChoiceRow(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = Size.touch)
            .clickable(role = Role.RadioButton, onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected, onClick = null)
        Text(label, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface)
    }
}

@Composable
private fun CheckRow(label: String, checked: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = Size.touch)
            .clickable(role = Role.Checkbox, onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked = checked, onCheckedChange = null)
        Text(label, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface)
    }
}
