@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.material3.ExperimentalMaterial3Api

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.SegmentedTabs
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import ch.nicolab.cadence.tasks.relations.TaskRelationItem
import ch.nicolab.cadence.tasks.relations.TaskRelations

/**
 * Section « Liens » de la fiche d'une tâche : « Bloque : … » et « Bloquée par : … »,
 * toucher ouvre la tâche liée, croix retire le lien, « + Lier » ouvre le sélecteur de tâche.
 */
@Composable
internal fun TaskRelationsSection(
    relations: List<TaskRelationItem>,
    onOpenTask: (String) -> Unit,
    onRemove: (TaskRelationItem) -> Unit,
    onAddClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val blocks = remember(relations) { TaskRelations.blocks(relations) }
    val blockedBy = remember(relations) { TaskRelations.blockedBy(relations) }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                stringResource(R.string.task_relations_title),
                style = MaterialTheme.typography.titleSmall,
                color = cadence.onSurfaceVariant,
            )
            TextButton(onClick = onAddClick) {
                Text(stringResource(R.string.task_relations_add))
            }
        }
        blocks.forEach { relation ->
            RelationRow(
                label = stringResource(R.string.task_relations_blocks_prefix, relation.task.name),
                closed = TaskStatus.isClosed(relation.task.status),
                onOpen = { onOpenTask(relation.task.uid) },
                onRemove = { onRemove(relation) },
            )
        }
        blockedBy.forEach { relation ->
            RelationRow(
                label = stringResource(R.string.task_relations_blocked_by_prefix, relation.task.name),
                closed = TaskStatus.isClosed(relation.task.status),
                onOpen = { onOpenTask(relation.task.uid) },
                onRemove = { onRemove(relation) },
            )
        }
    }
}

@Composable
private fun RelationRow(
    label: String,
    closed: Boolean,
    onOpen: () -> Unit,
    onRemove: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = Size.touch)
            .clickable(role = Role.Button, onClick = onOpen),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            color = if (closed) cadence.onSurfaceVariant else cadence.primary,
            textDecoration = if (closed) TextDecoration.LineThrough else null,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = onRemove) {
            Icon(
                Icons.Outlined.Close,
                contentDescription = stringResource(R.string.task_relations_remove),
                tint = cadence.onSurfaceVariant,
                modifier = Modifier.size(Size.iconSm),
            )
        }
    }
}

/** Sélecteur de tâche pour créer un lien « Bloque » ou « Bloquée par ». */
@Composable
internal fun LinkTaskSheet(
    taskUid: String,
    allTasks: List<TaskItem>,
    existing: List<TaskRelationItem>,
    onPick: (TaskItem, String) -> Unit,
    onDismiss: () -> Unit,
) {
    var selectedType by remember { mutableStateOf(TaskRelations.TYPE_BLOCKS) }
    var query by remember { mutableStateOf("") }
    val candidates = remember(allTasks, taskUid, selectedType, existing, query) {
        TaskRelations.pickCandidates(allTasks, taskUid, selectedType, existing, query)
    }

    CadenceSheet(
        title = stringResource(R.string.task_relations_pick_title),
        subtitle = null,
        dismiss = onDismiss,
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(Space.md)) {
            SegmentedTabs(
                labels = listOf(
                    stringResource(R.string.task_relations_type_blocks),
                    stringResource(R.string.task_relations_type_blocked_by),
                ),
                selected = if (selectedType == TaskRelations.TYPE_BLOCKS) 0 else 1,
                onSelect = {
                    selectedType = if (it == 0) TaskRelations.TYPE_BLOCKS else TaskRelations.TYPE_BLOCKED_BY
                },
            )
            CadenceField(
                value = query,
                onValue = { query = it },
                label = stringResource(R.string.task_relations_search_hint),
            )
            if (candidates.isEmpty()) {
                Text(
                    stringResource(R.string.task_relations_empty_search),
                    style = MaterialTheme.typography.bodyMedium,
                    color = cadence.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = Space.md),
                )
            } else {
                LazyColumn(
                    Modifier.fillMaxWidth().heightIn(max = Size.agendaHour * 5),
                    verticalArrangement = Arrangement.spacedBy(Space.xs),
                ) {
                    items(candidates, key = { it.uid }) { target ->
                        Panel(
                            onClick = {
                                onPick(target, selectedType)
                                onDismiss()
                            },
                        ) {
                            Text(
                                target.name,
                                style = MaterialTheme.typography.bodyLarge,
                                color = cadence.onSurface,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(Space.xs))
        }
    }
}
