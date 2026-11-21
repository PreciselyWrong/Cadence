package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.components.CadenceMenu
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.BoardColumn
import ch.nicolab.cadence.tasks.model.BoardTaskPlacement
import ch.nicolab.cadence.tasks.model.ProjectBoard
import ch.nicolab.cadence.tasks.model.ProjectSectionItem
import ch.nicolab.cadence.tasks.model.TaskItem
import kotlin.math.roundToInt
import kotlinx.coroutines.delay

/**
 * Tableau Kanban d'un projet : colonnes défilantes horizontalement (« Sans section » en premier,
 * puis les sections par position), glisser-déposer par appui long entre colonnes ou positions,
 * et action « Déplacer vers… » dans le menu de chaque carte.
 */
@Composable
internal fun ProjectBoardView(
    projectUid: String,
    sections: List<ProjectSectionItem>,
    tasks: List<TaskItem>,
    moment: Moment,
    viewModel: TasksViewModel,
    onOpen: (TaskItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    val columns = remember(sections, tasks) { ProjectBoard.buildColumns(sections, tasks) }
    val rowState = rememberLazyListState()
    val haptic = rememberCadenceHaptic()
    val density = LocalDensity.current

    var creatingSection by remember { mutableStateOf(false) }
    var renamingSection by remember { mutableStateOf<ProjectSectionItem?>(null) }
    var deletingSection by remember { mutableStateOf<ProjectSectionItem?>(null) }
    var movingTask by remember { mutableStateOf<TaskItem?>(null) }

    // État du glisser-déposer en coordonnées racine du tableau.
    var boardOrigin by remember { mutableStateOf(Offset.Zero) }
    var boardWidthPx by remember { mutableStateOf(0f) }
    var draggingTask by remember { mutableStateOf<TaskItem?>(null) }
    var pointerRoot by remember { mutableStateOf(Offset.Zero) }
    val columnBounds = remember { mutableStateMapOf<String, Rect>() }
    val cardBounds = remember { mutableStateMapOf<String, Pair<String?, Rect>>() }

    val dropTarget = remember(draggingTask, pointerRoot, columns, columnBounds.toMap(), cardBounds.toMap()) {
        val dragging = draggingTask ?: return@remember null
        val targetColKey = columnBounds.entries.firstOrNull { (_, rect) -> rect.contains(pointerRoot) }?.key
            ?: return@remember null
        val targetSectionUid = targetColKey.ifEmpty { null }
        val colCards = columns.firstOrNull { it.uid == targetSectionUid }?.tasks.orEmpty()
            .filter { it.uid != dragging.uid }
        val beforeUid = colCards.firstOrNull { card ->
            val rect = cardBounds[card.uid]?.second ?: return@firstOrNull false
            pointerRoot.y < rect.center.y
        }?.uid
        targetSectionUid to beforeUid
    }

    // Défilement horizontal automatique quand le doigt approche d'un bord pendant un glisser.
    LaunchedEffect(draggingTask != null) {
        if (draggingTask == null) return@LaunchedEffect
        val edgePx = with(density) { 48.dp.toPx() }
        val stepPx = with(density) { 14.dp.toPx() }
        while (draggingTask != null) {
            val localX = pointerRoot.x - boardOrigin.x
            when {
                localX < edgePx -> rowState.scrollBy(-stepPx)
                boardWidthPx > 0f && localX > boardWidthPx - edgePx -> rowState.scrollBy(stepPx)
            }
            delay(16L)
        }
    }

    BoxWithConstraints(
        modifier = modifier.onGloballyPositioned { coords ->
            val bounds = coords.boundsInRoot()
            boardOrigin = bounds.topLeft
            boardWidthPx = bounds.width
        },
    ) {
        val columnWidth = (maxWidth * 0.85f).coerceIn(240.dp, 360.dp)
        val sectionsByUid = remember(sections) { sections.associateBy { it.uid } }

        LazyRow(
            state = rowState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = Space.md, vertical = Space.sm),
            horizontalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            items(columns, key = { it.uid ?: "" }) { col ->
                val colKey = col.uid ?: ""
                val isTargetCol = dropTarget?.first == col.uid && draggingTask != null
                BoardColumnCard(
                    column = col,
                    section = col.uid?.let { sectionsByUid[it] },
                    highlighted = isTargetCol,
                    dropBeforeUid = if (isTargetCol) dropTarget?.second else null,
                    draggingTaskUid = draggingTask?.uid,
                    moment = moment,
                    viewModel = viewModel,
                    onOpen = onOpen,
                    onRequestMove = { task -> movingTask = task },
                    onRename = { section -> renamingSection = section },
                    onDelete = { section -> deletingSection = section },
                    onDragStart = { task, startOffset ->
                        haptic.selection()
                        draggingTask = task
                        pointerRoot = startOffset
                    },
                    onDrag = { delta -> pointerRoot += delta },
                    onDragEnd = {
                        val dragged = draggingTask
                        val target = dropTarget
                        draggingTask = null
                        if (dragged != null && target != null) {
                            val placements = ProjectBoard.movePlacements(
                                columns = columns,
                                taskUid = dragged.uid,
                                targetSectionUid = target.first,
                                beforeTaskUid = target.second,
                            )
                            if (placements.isNotEmpty()) {
                                haptic.selection()
                                viewModel.moveBoardTasks(placements)
                            }
                        }
                    },
                    onDragCancel = { draggingTask = null },
                    onCardBounds = { uid, rect -> cardBounds[uid] = col.uid to rect },
                    modifier = Modifier
                        .width(columnWidth)
                        .fillMaxHeight()
                        .onGloballyPositioned { coords ->
                            columnBounds[colKey] = coords.boundsInRoot()
                        },
                )
            }

            item(key = "add-section") {
                Surface(
                    onClick = { creatingSection = true },
                    shape = Radius.Card,
                    color = cadence.containerLow,
                    border = BorderStroke(Size.hairline, cadence.outlineVariant),
                    modifier = Modifier.width(columnWidth),
                ) {
                    Row(
                        modifier = Modifier.padding(Space.md),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        Icon(Icons.Outlined.Add, contentDescription = null, tint = cadence.primary)
                        Spacer(Modifier.width(Space.xs))
                        Text(
                            text = stringResource(R.string.project_board_add_section),
                            style = MaterialTheme.typography.titleSmall,
                            color = cadence.primary,
                        )
                    }
                }
            }
        }

        // Fantôme flottant de la carte en cours de déplacement.
        val dragged = draggingTask
        if (dragged != null) {
            val local = pointerRoot - boardOrigin
            Surface(
                shape = Radius.Control,
                color = cadence.card,
                tonalElevation = 6.dp,
                shadowElevation = 8.dp,
                border = BorderStroke(1.dp, cadence.primary),
                modifier = Modifier
                    .offset {
                        IntOffset(
                            (local.x - with(density) { 120.dp.toPx() }).roundToInt(),
                            (local.y - with(density) { 28.dp.toPx() }).roundToInt(),
                        )
                    }
                    .width((columnWidth - Space.md * 2).coerceAtLeast(180.dp))
                    .alpha(0.92f),
            ) {
                Text(
                    text = dragged.name,
                    style = MaterialTheme.typography.bodyMedium,
                    color = cadence.onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(Space.md),
                )
            }
        }
    }

    if (creatingSection) {
        SectionNameDialog(
            title = stringResource(R.string.project_board_new_section_title),
            initial = "",
            onConfirm = { name ->
                creatingSection = false
                viewModel.createProjectSection(projectUid, name)
            },
            onDismiss = { creatingSection = false },
        )
    }

    renamingSection?.let { section ->
        SectionNameDialog(
            title = stringResource(R.string.project_board_rename_section_title),
            initial = section.name,
            onConfirm = { name ->
                renamingSection = null
                viewModel.renameProjectSection(section.uid, name)
            },
            onDismiss = { renamingSection = null },
        )
    }

    deletingSection?.let { section ->
        AlertDialog(
            onDismissRequest = { deletingSection = null },
            title = { Text(stringResource(R.string.project_board_delete_title, section.name)) },
            text = { Text(stringResource(R.string.project_board_delete_body)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        deletingSection = null
                        viewModel.deleteProjectSection(section.uid)
                    },
                ) {
                    Text(stringResource(R.string.project_board_delete), color = cadence.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { deletingSection = null }) {
                    Text(stringResource(R.string.tasks_cancel))
                }
            },
        )
    }

    movingTask?.let { task ->
        MoveToSectionDialog(
            task = task,
            columns = columns,
            onSelect = { targetSectionUid ->
                movingTask = null
                val placements = ProjectBoard.movePlacements(
                    columns = columns,
                    taskUid = task.uid,
                    targetSectionUid = targetSectionUid,
                    beforeTaskUid = null,
                )
                if (placements.isNotEmpty()) {
                    viewModel.moveBoardTasks(placements)
                }
            },
            onDismiss = { movingTask = null },
        )
    }
}

@Composable
private fun BoardColumnCard(
    column: BoardColumn,
    section: ProjectSectionItem?,
    highlighted: Boolean,
    dropBeforeUid: String?,
    draggingTaskUid: String?,
    moment: Moment,
    viewModel: TasksViewModel,
    onOpen: (TaskItem) -> Unit,
    onRequestMove: (TaskItem) -> Unit,
    onRename: (ProjectSectionItem) -> Unit,
    onDelete: (ProjectSectionItem) -> Unit,
    onDragStart: (TaskItem, Offset) -> Unit,
    onDrag: (Offset) -> Unit,
    onDragEnd: () -> Unit,
    onDragCancel: () -> Unit,
    onCardBounds: (String, Rect) -> Unit,
    modifier: Modifier = Modifier,
) {
    var menuOpen by remember { mutableStateOf(false) }

    Surface(
        shape = Radius.Card,
        color = cadence.containerLow,
        border = BorderStroke(
            if (highlighted) 2.dp else Size.hairline,
            if (highlighted) cadence.primary else cadence.outlineVariant,
        ),
        modifier = modifier,
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = Space.md, end = Space.xs, top = Space.sm, bottom = Space.xs),
            ) {
                Text(
                    text = column.name ?: stringResource(R.string.project_board_unsectioned),
                    style = MaterialTheme.typography.titleSmall,
                    color = cadence.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = column.tasks.size.toString(),
                    style = MaterialTheme.typography.labelMedium,
                    color = cadence.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = Space.xs),
                )
                if (section != null) {
                    Box {
                        IconButton(
                            onClick = { menuOpen = true },
                            modifier = Modifier.size(36.dp),
                        ) {
                            Icon(
                                Icons.Outlined.MoreVert,
                                contentDescription = stringResource(R.string.project_board_section_more),
                                tint = cadence.onSurfaceVariant,
                            )
                        }
                        CadenceMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.project_board_rename)) },
                                onClick = {
                                    menuOpen = false
                                    onRename(section)
                                },
                            )
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.project_board_delete), color = cadence.error) },
                                onClick = {
                                    menuOpen = false
                                    onDelete(section)
                                },
                            )
                        }
                    }
                }
            }

            if (column.tasks.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(Space.lg),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = stringResource(R.string.project_board_empty),
                        style = MaterialTheme.typography.bodySmall,
                        color = cadence.onSurfaceVariant,
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = Space.sm, vertical = Space.xs),
                    verticalArrangement = Arrangement.spacedBy(Space.xs),
                ) {
                    items(column.tasks, key = { it.uid }) { task ->
                        if (highlighted && dropBeforeUid == task.uid) {
                            HorizontalDivider(
                                thickness = 2.dp,
                                color = cadence.primary,
                                modifier = Modifier.padding(vertical = Space.xs),
                            )
                        }
                        var cardTopLeft by remember { mutableStateOf(Offset.Zero) }
                        Surface(
                            shape = Radius.Control,
                            color = cadence.surface,
                            border = BorderStroke(Size.hairline, cadence.outlineVariant),
                            modifier = Modifier
                                .fillMaxWidth()
                                .alpha(if (draggingTaskUid == task.uid) 0.35f else 1f)
                                .onGloballyPositioned { coords ->
                                    val bounds = coords.boundsInRoot()
                                    cardTopLeft = bounds.topLeft
                                    onCardBounds(task.uid, bounds)
                                }
                                .pointerInput(task.uid) {
                                    detectDragGesturesAfterLongPress(
                                        onDragStart = { localOffset ->
                                            onDragStart(task, cardTopLeft + localOffset)
                                        },
                                        onDrag = { change, dragAmount ->
                                            change.consume()
                                            onDrag(dragAmount)
                                        },
                                        onDragEnd = onDragEnd,
                                        onDragCancel = onDragCancel,
                                    )
                                },
                        ) {
                            TaskRow(
                                task = task,
                                projectName = null,
                                projectColor = null,
                                projectIcon = null,
                                today = moment.today,
                                zone = moment.zone,
                                onToggle = { viewModel.toggle(task, hold = true) },
                                onOpen = { onOpen(task) },
                                onSwipeAction = { viewModel.swipe(task, it) },
                                onMenu = { viewModel.openMenu(task, onMoveSection = { onRequestMove(task) }) },
                                longPressMenu = false,
                                trailing = {
                                    IconButton(
                                        onClick = { viewModel.openMenu(task, onMoveSection = { onRequestMove(task) }) },
                                        modifier = Modifier.size(32.dp),
                                    ) {
                                        Icon(
                                            Icons.Outlined.MoreHoriz,
                                            contentDescription = stringResource(R.string.project_board_card_more),
                                            tint = cadence.onSurfaceVariant,
                                        )
                                    }
                                },
                            )
                        }
                    }
                    if (highlighted && dropBeforeUid == null) {
                        item(key = "drop-end") {
                            HorizontalDivider(
                                thickness = 2.dp,
                                color = cadence.primary,
                                modifier = Modifier.padding(vertical = Space.xs),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionNameDialog(
    title: String,
    initial: String,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var text by remember(initial) { mutableStateOf(initial) }
    val valid = text.trim().isNotEmpty()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                singleLine = true,
                placeholder = { Text(stringResource(R.string.project_board_section_name_hint)) },
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(enabled = valid, onClick = { onConfirm(text.trim()) }) {
                Text(stringResource(R.string.tasks_save))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.tasks_cancel))
            }
        },
    )
}

@Composable
private fun MoveToSectionDialog(
    task: TaskItem,
    columns: List<BoardColumn>,
    onSelect: (String?) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.project_board_move_to_title)) },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                columns.forEach { col ->
                    val current = task.sectionUid == col.uid
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSelect(col.uid) }
                            .padding(vertical = Space.sm, horizontal = Space.xs),
                    ) {
                        Text(
                            text = col.name ?: stringResource(R.string.project_board_unsectioned),
                            style = MaterialTheme.typography.bodyLarge,
                            color = if (current) cadence.primary else cadence.onSurface,
                            modifier = Modifier.weight(1f),
                        )
                        if (current) {
                            Icon(
                                Icons.Outlined.Check,
                                contentDescription = null,
                                tint = cadence.primary,
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.tasks_cancel))
            }
        },
    )
}
