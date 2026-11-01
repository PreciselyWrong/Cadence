package ch.nicolab.cadence.tasks.ui

import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AddTask
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.CadenceFab
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.TaskCheckbox
import ch.nicolab.cadence.designsystem.components.navigationClearance
import ch.nicolab.cadence.designsystem.components.rememberAppSnackbarHostState
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.GoalBucket
import ch.nicolab.cadence.tasks.model.GoalHorizon
import ch.nicolab.cadence.tasks.model.GoalItem
import ch.nicolab.cadence.tasks.model.GoalOverview
import ch.nicolab.cadence.tasks.model.GoalProgress
import ch.nicolab.cadence.tasks.model.KeyResultCard
import ch.nicolab.cadence.tasks.model.ObjectiveCard
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/**
 * Écran Objectifs, ouvert depuis le Bilan : le même contenu que l'onglet Objectifs des Tâches ([GoalsPane]).
 * Ni Aujourd'hui ni les widgets n'en montrent rien.
 */
@Composable
fun GoalsScreen(onBack: () -> Unit) {
    val viewModel: TasksViewModel = viewModel()
    val snackbar = rememberAppSnackbarHostState()
    DeletionUndoEffect(viewModel, snackbar)
    var openTaskUid by rememberSaveable { mutableStateOf<String?>(null) }
    val palette = cadence
    BackHandler(onBack = onBack)

    Surface(Modifier.fillMaxSize(), color = palette.background, contentColor = palette.onSurface) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            Box(Modifier.padding(horizontal = Space.gutter)) {
                ScreenHeader(
                    title = stringResource(R.string.goals_title),
                    onBack = onBack,
                    backDescription = stringResource(R.string.goals_back),
                )
            }
            GoalsPane(viewModel, Modifier.weight(1f), bottomPadding = Space.xxxl, onOpenTask = { openTaskUid = it })
        }
    }
    TaskOverlays(viewModel = viewModel, snackbar = snackbar, selectedTaskUid = openTaskUid, onCloseTask = { openTaskUid = null })
}

/** Groupe repliable de l'écran : un groupe d'envies, les objectifs mis de côté ou les envies réalisées. */
private const val FOLD_OTHER_OBJECTIVES = "other-objectives"
private const val FOLD_DONE_WISHES = "done-wishes"

/**
 * Un seul écran, de haut en bas : recherche, objectifs actifs (progression, prochain pas, résultats clés dessous),
 * objectifs mis de côté (repliés), puis la liste d'envies en trois groupes repliables Avoir, Être, Faire et les
 * envies réalisées. Le bouton flottant ajoute une envie ; toucher un but ouvre sa feuille ([GoalSheets]).
 */
@Composable
internal fun GoalsPane(
    viewModel: TasksViewModel,
    modifier: Modifier = Modifier,
    bottomPadding: Dp = navigationClearance(),
    onOpenTask: (String) -> Unit = {},
) {
    val overview by viewModel.visibleGoals.collectAsStateWithLifecycle()
    val query by viewModel.goalQuery.collectAsStateWithLifecycle()
    var editingUid by rememberSaveable { mutableStateOf<String?>(null) }
    var stepFor by rememberSaveable { mutableStateOf<String?>(null) }
    var addOpen by rememberSaveable { mutableStateOf(false) }
    var open by rememberSaveable { mutableStateOf(setOf<String>()) }
    val searching = query.isNotBlank()
    val actions = GoalActions(
        onOpen = { editingUid = it },
        onOpenTask = onOpenTask,
        onCreateStep = { stepFor = it },
        onCompleteStep = { viewModel.toggle(it, hold = true) },
        onWishDone = viewModel::markWishDone,
        isOpen = { key -> searching || key in open },
        onToggle = { key -> open = if (key in open) open - key else open + key },
    )
    Box(modifier) {
        Column(Modifier.fillMaxSize()) {
            GoalSearchField(query, viewModel::searchGoals, Modifier.padding(horizontal = Space.gutter, vertical = Space.xs))
            LazyColumn(
                Modifier.weight(1f),
                contentPadding = PaddingValues(start = Space.gutter, end = Space.gutter, top = Space.xs, bottom = bottomPadding + Size.touch * 2),
            ) {
                val current = overview
                if (current != null) goalsContent(current, searching, actions)
            }
        }
        CadenceFab(
            icon = Icons.Outlined.Add,
            contentDescription = stringResource(R.string.goals_wish_add),
            onClick = { addOpen = true },
            modifier = Modifier.align(Alignment.BottomEnd).padding(end = Space.gutter, bottom = bottomPadding + Space.lg),
        )
    }
    GoalSheets(viewModel, editingUid, stepFor, onOpenTask = onOpenTask, onClose = {
        editingUid = null
        stepFor = null
    }, onCreateStep = { stepFor = it })
    if (addOpen) {
        val lastOpened = GoalBucket.entries.lastOrNull { it.wire in open } ?: GoalBucket.DO
        WishCaptureSheet(initialBucket = lastOpened, onAdd = viewModel::createWish, onDismiss = { addOpen = false })
    }
}

/** Gestes de l'écran, passés aux lignes. */
private class GoalActions(
    val onOpen: (String) -> Unit,
    val onOpenTask: (String) -> Unit,
    val onCreateStep: (String) -> Unit,
    val onCompleteStep: (TaskItem) -> Unit,
    val onWishDone: (GoalItem) -> Unit,
    val isOpen: (String) -> Boolean,
    val onToggle: (String) -> Unit,
)

private fun LazyListScope.goalsContent(overview: GoalOverview, searching: Boolean, actions: GoalActions) {
    if (overview.isEmpty) {
        item(key = "empty") { EmptyLine(if (searching) R.string.goals_search_none else R.string.goals_empty) }
        return
    }
    if (overview.objectives.isNotEmpty()) {
        item(key = "objectives-header") { SectionHeader(stringResource(R.string.goals_section_objectives), count = overview.objectives.size) }
        overview.objectives.forEach { card ->
            item(key = "objective-${card.goal.uid}") { ObjectivePanel(card, actions, Modifier.padding(bottom = Space.sm)) }
        }
    }
    if (overview.otherObjectives.isNotEmpty()) {
        item(key = "other-header") {
            FoldHeader(stringResource(R.string.goals_section_other), overview.otherObjectives.size, actions.isOpen(FOLD_OTHER_OBJECTIVES)) {
                actions.onToggle(FOLD_OTHER_OBJECTIVES)
            }
        }
        if (actions.isOpen(FOLD_OTHER_OBJECTIVES)) {
            overview.otherObjectives.forEach { card ->
                item(key = "objective-${card.goal.uid}") { ObjectivePanel(card, actions, Modifier.padding(bottom = Space.sm)) }
            }
        }
    }
    val hasWishes = overview.openWishCount > 0 || overview.doneWishes.isNotEmpty()
    if (!hasWishes) {
        if (!searching) item(key = "wishes-empty") { EmptyLine(R.string.goals_wishes_empty) }
        return
    }
    item(key = "wishes-header") { SectionHeader(stringResource(R.string.goals_tab_wishes), count = overview.openWishCount) }
    GoalBucket.entries.forEach { bucket ->
        val wishes = overview.wishes.getValue(bucket)
        if (searching && wishes.isEmpty()) return@forEach
        val expanded = actions.isOpen(bucket.wire)
        item(key = "bucket-${bucket.wire}") {
            FoldHeader(stringResource(bucketLabel(bucket)), wishes.size, expanded) { actions.onToggle(bucket.wire) }
        }
        if (expanded) {
            itemsIndexed(wishes, key = { _, wish -> "wish-${wish.uid}" }) { index, wish ->
                WishRow(wish, overview.wishSteps[wish.uid], overview.linkedTasks[wish.uid] ?: 0, index, wishes.size, actions)
            }
        }
    }
    if (overview.doneWishes.isNotEmpty()) {
        val expanded = actions.isOpen(FOLD_DONE_WISHES)
        item(key = "done-header") {
            FoldHeader(stringResource(R.string.goals_section_done_wishes), overview.doneWishes.size, expanded) { actions.onToggle(FOLD_DONE_WISHES) }
        }
        if (expanded) {
            itemsIndexed(overview.doneWishes, key = { _, wish -> "wish-${wish.uid}" }) { index, wish ->
                WishRow(wish, null, 0, index, overview.doneWishes.size, actions, done = true)
            }
        }
    }
}

@Composable
private fun EmptyLine(@StringRes message: Int) {
    Text(
        stringResource(message),
        style = MaterialTheme.typography.bodyMedium,
        color = cadence.onSurfaceVariant,
        modifier = Modifier.padding(vertical = Space.lg),
    )
}

/** Recherche dans les titres et les notes ; une croix l'efface. */
@Composable
private fun GoalSearchField(query: String, onQuery: (String) -> Unit, modifier: Modifier = Modifier) {
    val palette = cadence
    Row(
        modifier.fillMaxWidth().clip(Radius.Pill).background(palette.containerHigh).padding(start = Space.lg, end = Space.xs).heightIn(min = Size.touch),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.Search, contentDescription = null, tint = palette.onSurfaceVariant, modifier = Modifier.size(Size.icon))
        Spacer(Modifier.width(Space.sm))
        InlineTextField(
            value = query,
            onValueChange = onQuery,
            placeholder = stringResource(R.string.goals_search_hint),
            singleLine = true,
            modifier = Modifier.weight(1f),
        )
        if (query.isNotEmpty()) {
            Box(
                Modifier.size(Size.touch).clip(CircleShape).clickable(role = Role.Button) { onQuery("") },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Outlined.Close, contentDescription = stringResource(R.string.goals_search_clear), tint = palette.onSurfaceVariant)
            }
        }
    }
}

/** En-tête de groupe repliable : nom, nombre, chevron ; toute la ligne se touche. */
@Composable
private fun FoldHeader(title: String, count: Int, expanded: Boolean, onToggle: () -> Unit) {
    val palette = cadence
    val action = stringResource(if (expanded) R.string.goals_fold_close else R.string.goals_fold_open, title)
    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = Space.sm)
            .clip(Radius.Chip)
            .clickable(onClickLabel = action, role = Role.Button, onClick = onToggle)
            .heightIn(min = Size.touch)
            .padding(vertical = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (expanded) Icons.Outlined.ExpandMore else Icons.Outlined.ChevronRight,
            contentDescription = null,
            tint = palette.onSurfaceVariant,
            modifier = Modifier.size(Size.icon),
        )
        Spacer(Modifier.width(Space.sm))
        Text(title, style = MaterialTheme.typography.titleMedium, color = palette.onSurface, modifier = Modifier.weight(1f))
        if (count > 0) Text(count.toString(), style = MaterialTheme.typography.labelLarge, color = palette.outline)
    }
}

/**
 * Carte d'un objectif : titre et pourcentage, horizon et échéance, barre fine, prochain pas (case pour le terminer,
 * ou « Ajouter un prochain pas »), puis ses résultats clés en lignes courtes « titre … 3/10 ».
 */
@Composable
private fun ObjectivePanel(card: ObjectiveCard, actions: GoalActions, modifier: Modifier = Modifier) {
    val palette = cadence
    val color = goalColor(card.goal)
    Panel(modifier, onClick = { actions.onOpen(card.goal.uid) }) {
        Row(verticalAlignment = Alignment.Top) {
            Text(
                card.goal.title,
                style = MaterialTheme.typography.titleMedium,
                color = palette.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            card.progress.percent?.let {
                Spacer(Modifier.width(Space.sm))
                Text(stringResource(R.string.goals_percent, it), style = MaterialTheme.typography.labelLarge, color = palette.onSurfaceVariant)
            }
        }
        goalMeta(card.goal)?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant)
        }
        Spacer(Modifier.height(Space.sm))
        ProgressBar(card.progress, color)
        if (card.goal.isActive) {
            Spacer(Modifier.height(Space.xs))
            NextStepLine(card.goal, card.nextStep, actions)
        }
        if (card.keyResults.isNotEmpty()) {
            Spacer(Modifier.height(Space.xs))
            card.keyResults.forEach { KeyResultLine(it, actions) }
        }
    }
}

/** Prochain pas d'un but : la case le termine, le texte ouvre la tâche ; sans tâche ouverte, un lien discret en crée une. */
@Composable
private fun NextStepLine(goal: GoalItem, step: TaskItem?, actions: GoalActions) {
    val palette = cadence
    if (step == null) {
        Row(
            Modifier
                .fillMaxWidth()
                .clip(Radius.Chip)
                .clickable(role = Role.Button) { actions.onCreateStep(goal.uid) }
                .heightIn(min = Size.touch),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.AddTask, contentDescription = null, tint = palette.primary, modifier = Modifier.size(Size.icon))
            Spacer(Modifier.width(Space.md))
            Text(stringResource(R.string.goals_step_add), style = MaterialTheme.typography.bodyMedium, color = palette.primary)
        }
        return
    }
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        TaskCheckbox(
            checked = false,
            onCheckedChange = { actions.onCompleteStep(step) },
            contentDescription = stringResource(R.string.goals_step_complete, step.name),
        )
        Column(
            Modifier
                .weight(1f)
                .clip(Radius.Chip)
                .clickable { actions.onOpenTask(step.uid) }
                .padding(vertical = Space.xs),
        ) {
            Text(stringResource(R.string.goals_step_label), style = MaterialTheme.typography.labelMedium, color = palette.outline)
            Text(step.name, style = MaterialTheme.typography.bodyMedium, color = palette.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Résultat clé : une ligne, avancement « 3/10 » à droite, une coche une fois tout fait. */
@Composable
private fun KeyResultLine(result: KeyResultCard, actions: GoalActions) {
    val palette = cadence
    val progress = result.progress
    val complete = progress.total > 0 && progress.done == progress.total
    val description = if (progress.total == 0) {
        stringResource(R.string.goals_nothing_linked)
    } else {
        stringResource(R.string.goals_progress, progress.done, progress.total)
    }
    Row(
        Modifier
            .fillMaxWidth()
            .clip(Radius.Chip)
            .clickable { actions.onOpen(result.goal.uid) }
            .heightIn(min = Size.touch)
            .semantics { contentDescription = "${result.goal.title}, $description" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(Space.sm).clip(CircleShape).background(if (complete) palette.primary else palette.outline))
        Spacer(Modifier.width(Space.md))
        Text(
            result.goal.title,
            style = MaterialTheme.typography.bodyMedium,
            color = if (complete) palette.onSurfaceVariant else palette.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(Space.sm))
        if (complete) {
            Icon(Icons.Outlined.CheckCircle, contentDescription = null, tint = palette.primary, modifier = Modifier.size(Size.icon))
        } else if (progress.total > 0) {
            Text(stringResource(R.string.goals_fraction, progress.done, progress.total), style = MaterialTheme.typography.labelLarge, color = palette.onSurfaceVariant)
        }
    }
}

/**
 * Ligne d'envie : case « Faite » (l'envie passe en réalisée, avec « Annuler »), titre et prochain pas éventuel ;
 * le bouton de droite crée une tâche liée. Toucher la ligne ouvre la feuille de l'envie.
 */
@Composable
private fun WishRow(
    wish: GoalItem,
    step: TaskItem?,
    linked: Int,
    index: Int,
    count: Int,
    actions: GoalActions,
    done: Boolean = false,
) {
    val palette = cadence
    val subtitle = when {
        done -> stringResource(if (wish.status == "dropped") R.string.goals_status_wish_dropped else R.string.goals_status_wish_done)
        step != null -> stringResource(R.string.goals_step_inline, step.name)
        linked > 0 -> pluralStringResource(R.plurals.goals_linked_tasks, linked, linked)
        wish.status == "paused" -> stringResource(R.string.goals_status_paused)
        else -> null
    }
    Surface(
        modifier = Modifier.fillMaxWidth().padding(bottom = Space.groupGap),
        shape = rowGroupShape(index, count),
        color = palette.card,
        contentColor = palette.onSurface,
    ) {
        Row(
            Modifier.clickable(onClickLabel = stringResource(R.string.goals_open_edit, wish.title)) { actions.onOpen(wish.uid) }
                .heightIn(min = Size.touch + Space.sm)
                .padding(start = Space.xs, end = Space.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (done) {
                Box(Modifier.size(Size.touch), contentAlignment = Alignment.Center) {
                    Icon(Icons.Outlined.CheckCircle, contentDescription = null, tint = palette.outline, modifier = Modifier.size(Size.icon))
                }
            } else {
                TaskCheckbox(
                    checked = false,
                    onCheckedChange = { actions.onWishDone(wish) },
                    contentDescription = stringResource(R.string.goals_wish_done, wish.title),
                )
            }
            Column(Modifier.weight(1f).padding(vertical = Space.sm)) {
                Text(
                    wish.title,
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (done) palette.onSurfaceVariant else palette.onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                subtitle?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (!done) {
                Box(
                    Modifier.size(Size.touch).clip(CircleShape).clickable(role = Role.Button) { actions.onCreateStep(wish.uid) },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Outlined.AddTask,
                        contentDescription = stringResource(R.string.goals_create_task_for, wish.title),
                        tint = palette.outline,
                        modifier = Modifier.size(Size.icon),
                    )
                }
            }
        }
    }
}

/** Barre fine d'avancement ; « Rien de lié » est lu par TalkBack quand rien ne pointe vers le but. */
@Composable
private fun ProgressBar(progress: GoalProgress, color: Color) {
    val palette = cadence
    val text = if (progress.total == 0) {
        stringResource(R.string.goals_nothing_linked)
    } else {
        stringResource(R.string.goals_progress, progress.done, progress.total)
    }
    Box(
        Modifier
            .fillMaxWidth()
            .height(Size.counterTrack)
            .clip(Radius.Pill)
            .background(palette.containerHigh)
            .semantics { contentDescription = text },
    ) {
        Box(Modifier.fillMaxWidth(progress.fraction).height(Size.counterTrack).clip(Radius.Pill).background(color))
    }
}

@Composable
private fun goalColor(goal: GoalItem): Color = projectRailColor(goal.color)?.let(::Color) ?: cadence.primary

/** Horizon, échéance et état hors « actif », sur une ligne neutre. */
@Composable
private fun goalMeta(goal: GoalItem): String? {
    val parts = buildList {
        add(stringResource(horizonLabel(goal.horizon)))
        goal.targetDate?.let { add(stringResource(R.string.goals_target, it.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(Locale.FRENCH)))) }
        statusLabel(goal.status)?.let { add(stringResource(it)) }
    }
    return parts.joinToString(" · ")
}

@StringRes
internal fun horizonLabel(horizon: GoalHorizon): Int = when (horizon) {
    GoalHorizon.MONTH -> R.string.goals_horizon_month
    GoalHorizon.QUARTER -> R.string.goals_horizon_quarter
    GoalHorizon.SEASON -> R.string.goals_horizon_season
    GoalHorizon.YEAR -> R.string.goals_horizon_year
}

@StringRes
internal fun statusLabel(status: String?): Int? = when (status) {
    "achieved" -> R.string.goals_status_achieved
    "paused" -> R.string.goals_status_paused
    "dropped" -> R.string.goals_status_dropped
    else -> null
}

@StringRes
internal fun bucketLabel(bucket: GoalBucket): Int = when (bucket) {
    GoalBucket.HAVE -> R.string.goals_bucket_have
    GoalBucket.BE -> R.string.goals_bucket_be
    GoalBucket.DO -> R.string.goals_bucket_do
}

/** Entrée du Bilan vers les objectifs, seulement avec un serveur (ils n'existent que par la synchro). */
@Composable
fun GoalsEntryPanel(onOpen: () -> Unit) {
    val context = LocalContext.current
    val connection = remember(context) { TasksGraph.connection(context) }
    val info by connection.observe().collectAsStateWithLifecycle(initialValue = null)
    if (info == null) return
    val palette = cadence
    Panel(onClick = onOpen) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.goals_entry_title), style = MaterialTheme.typography.titleMedium, color = palette.onSurface)
                Text(stringResource(R.string.goals_entry_detail), style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
            }
            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = palette.onSurfaceVariant)
        }
    }
}
