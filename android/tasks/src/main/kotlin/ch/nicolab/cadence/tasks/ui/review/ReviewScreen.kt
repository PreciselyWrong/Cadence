@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui.review

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.CallSplit
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.EventNote
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.OpenInFull
import androidx.compose.material.icons.outlined.PauseCircle
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.ActionRow
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.EmptyState
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.TabPill
import ch.nicolab.cadence.designsystem.components.TabPills
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.components.rememberAppSnackbarHostState
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.Decision
import ch.nicolab.cadence.tasks.model.FunnelStage
import ch.nicolab.cadence.tasks.model.LinkItem
import ch.nicolab.cadence.tasks.model.TagPaths
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.review.BacklogGroup
import ch.nicolab.cadence.tasks.review.BacklogNames
import ch.nicolab.cadence.tasks.review.ProjectReason
import ch.nicolab.cadence.tasks.review.ReviewBacklog
import ch.nicolab.cadence.tasks.review.ReviewInboxItem
import ch.nicolab.cadence.tasks.review.ReviewProject
import ch.nicolab.cadence.tasks.review.ReviewStep
import ch.nicolab.cadence.tasks.review.ReviewTask
import ch.nicolab.cadence.tasks.review.WeekCapacity
import ch.nicolab.cadence.tasks.ui.ChoiceCard
import ch.nicolab.cadence.tasks.ui.QuickPill
import ch.nicolab.cadence.tasks.ui.TaskDatePickerDialog
import ch.nicolab.cadence.tasks.ui.TaskDetailSheet
import ch.nicolab.cadence.tasks.ui.TaskRowMeta
import ch.nicolab.cadence.tasks.ui.TasksViewModel
import ch.nicolab.cadence.tasks.ui.ThisOrThatSheet
import ch.nicolab.cadence.tasks.ui.formatReviewDay
import ch.nicolab.cadence.tasks.ui.funnelIcon
import ch.nicolab.cadence.tasks.ui.rememberProjectColors
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId

/** Feuille encore utile : un champ (prochaine tâche d'un projet) ou une date (« Revoir le… »). */
private sealed interface Asking {
    data class NextTask(val project: ReviewProject) : Asking
    data class ReviewDate(val item: ReviewTask) : Asking
}

/** Ce que le téléphone sait de chaque ligne servie : la tâche locale, son lien, ses étiquettes. */
internal class RowContext(
    val local: Map<String, TaskItem>,
    val links: List<LinkItem>,
    val tagNames: Map<String, String>,
    val projectColors: Map<String, Int>,
) {
    fun link(item: ReviewTask): RowLink? {
        val task = local[item.uid]
        val text = ReviewBacklog.linkText(item.name, task?.note) ?: return null
        return RowLink(text, ReviewBacklog.linkFor(links, "task", item.uid, text))
    }

    fun tags(item: ReviewTask): List<String> {
        val task = local[item.uid] ?: return emptyList()
        return task.tagUids.mapNotNull { tagNames[it] }.filter { it != TagPaths.SOMEDAY }
            .map(TagPaths::leaf).take(TaskRowMeta.MAX_TAGS)
    }

    fun rail(item: ReviewTask): Color? = local[item.uid]?.projectUid?.let(projectColors::get)?.let(::Color)
}

/**
 * Revue, ouverte depuis le Bilan : six étapes, une à la fois, l'étape gardée entre deux sessions.
 * Toucher une ligne la déplie sur ses choix d'un toucher ; chaque décision est enregistrée seule, avec
 * « Annuler », une revue interrompue reprend donc là où elle était. « Plus tard » se parcourt par projet,
 * se filtre, se balaie (droite : aujourd'hui, gauche : dans un mois) ou se trie un par un.
 */
@Composable
fun ReviewScreen(onBack: () -> Unit, onOpenProject: (String) -> Unit) {
    val viewModel: ReviewViewModel = viewModel()
    val tasksViewModel: TasksViewModel = viewModel()
    val step by viewModel.step.collectAsStateWithLifecycle()
    val summary by viewModel.summary.collectAsStateWithLifecycle()
    val content by viewModel.content.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val routineMissing by viewModel.routineMissing.collectAsStateWithLifecycle()
    val quick by viewModel.quick.collectAsStateWithLifecycle()
    val local by viewModel.local.collectAsStateWithLifecycle()
    val links by tasksViewModel.links.collectAsStateWithLifecycle()
    val tags by tasksViewModel.tags.collectAsStateWithLifecycle()
    val projects by tasksViewModel.projects.collectAsStateWithLifecycle()
    val areas by tasksViewModel.areas.collectAsStateWithLifecycle()
    val projectColors = rememberProjectColors(tasksViewModel)
    val snackbar = rememberAppSnackbarHostState()
    var expanded by rememberSaveable { mutableStateOf<String?>(null) }
    var asking by remember { mutableStateOf<Asking?>(null) }
    var openTaskUid by rememberSaveable { mutableStateOf<String?>(null) }
    var choosing by remember { mutableStateOf<List<ReviewTask>?>(null) }
    var settingCapacity by remember { mutableStateOf<Int?>(null) }
    var settingCapacityOpen by remember { mutableStateOf(false) }
    var triaging by rememberSaveable { mutableStateOf(false) }
    val palette = cadence
    val undoLabel = stringResource(R.string.tasks_undo)

    LaunchedEffect(viewModel) { viewModel.messages.collect { snackbar.showSnackbar(it) } }
    LaunchedEffect(viewModel) {
        viewModel.notices.collect { notice ->
            snackbar.currentSnackbarData?.dismiss()
            launch {
                val result = snackbar.showSnackbar(notice.message, actionLabel = undoLabel, duration = SnackbarDuration.Short)
                if (result == SnackbarResult.ActionPerformed) notice.undo()
            }
        }
    }
    BackHandler(enabled = openTaskUid == null && !triaging && quick == null, onBack = onBack)

    val rows = remember(local, links, tags, projectColors) {
        RowContext(local, links, tags.associate { it.uid to it.name }, projectColors)
    }
    val choices = rememberChoices(viewModel, onOpenTask = { openTaskUid = it }, onOpenProject = onOpenProject, ask = { asking = it })
    val counts = summary?.value?.counts
    val subtitle = summary?.value?.let {
        if (it.attentionTotal == 0) stringResource(R.string.review_calm_clear)
        else pluralStringResource(R.plurals.review_calm, it.attentionTotal, it.attentionTotal)
    }
    val laterTasks = (content as? StepContent.Tasks)?.takeIf { step == ReviewStep.LATER }?.page?.items.orEmpty()
    val names = remember(projects, areas, rows) {
        BacklogNames(projects.associate { it.uid to it.name }, areas.associate { it.uid to it.name }, rows.tagNames)
    }
    val laterQuery by viewModel.laterQuery.collectAsStateWithLifecycle()
    val openedGroups by viewModel.openGroups.collectAsStateWithLifecycle()
    val laterGroups = remember(laterTasks, rows, names, laterQuery) {
        val linkTitles = laterTasks.mapNotNull { item -> rows.link(item)?.saved?.let { item.uid to it.displayTitle } }.toMap()
        ReviewBacklog.groups(laterTasks, rows.local, names, laterQuery, linkTitles)
    }
    val todayLabel = stringResource(R.string.review_action_today_short)
    val laterLabel = stringResource(R.string.review_action_review30)
    val noProject = stringResource(R.string.review_no_project)

    // Le tri un par un se pose par-dessus la liste, quel que soit le conteneur de l'écran.
    Box(Modifier.fillMaxSize()) {
    Surface(Modifier.fillMaxSize(), color = palette.background, contentColor = palette.onSurface) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            Box(Modifier.padding(horizontal = Space.gutter)) {
                ScreenHeader(
                    title = stringResource(R.string.review_title),
                    subtitle = subtitle,
                    onBack = onBack,
                    backDescription = stringResource(R.string.review_back),
                )
            }
            if (routineMissing) {
                TertiaryAction(
                    stringResource(R.string.review_routine_plan),
                    modifier = Modifier.padding(horizontal = Space.gutter),
                    onClick = viewModel::planRoutine,
                )
            }
            QuickReviewCard(
                modifier = Modifier.padding(horizontal = Space.gutter, vertical = Space.sm),
                onStart = { expanded = null; viewModel.startQuick() },
            )
            Box {
                TabPills(
                    tabs = ReviewStep.entries.map { TabPill(stringResource(stepLabel(it)), counts?.of(it)?.takeIf { n -> n > 0 }) },
                    selected = step.ordinal,
                    onSelect = { expanded = null; viewModel.select(ReviewStep.entries[it]) },
                    contentPadding = PaddingValues(start = Space.gutter, end = Space.xxl),
                )
                // Le dernier onglet glisse sous un fondu : la rangée se lit comme défilante, pas coupée.
                Box(Modifier.matchParentSize()) {
                    Box(
                        Modifier
                            .align(Alignment.CenterEnd)
                            .fillMaxHeight()
                            .width(Space.xl)
                            .background(Brush.horizontalGradient(listOf(Color.Transparent, palette.background))),
                    )
                }
            }
            LazyColumn(
                Modifier.weight(1f),
                contentPadding = PaddingValues(start = Space.gutter, end = Space.gutter, top = Space.md, bottom = Space.xxxl),
                verticalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                offlineLine(content)
                when (val current = content) {
                    StepContent.Loading -> Unit
                    StepContent.Unavailable -> item(key = "unavailable") {
                        EmptyState(
                            icon = Icons.Outlined.CloudOff,
                            title = stringResource(R.string.review_unavailable_title),
                            message = stringResource(R.string.review_unavailable),
                            action = { SecondaryAction(stringResource(R.string.review_retry), onClick = viewModel::load) },
                        )
                    }
                    is StepContent.Tasks -> if (step == ReviewStep.LATER) {
                        laterList(
                            items = current.page.items,
                            groups = laterGroups,
                            query = laterQuery,
                            open = openedGroups ?: ReviewBacklog.defaultOpen(laterGroups),
                            labels = Triple(todayLabel, laterLabel, noProject),
                            rows = rows,
                            viewModel = viewModel,
                            tasksViewModel = tasksViewModel,
                            choices = choices,
                            busy = busy,
                            expanded = expanded,
                            onExpand = { expanded = if (expanded == it) null else it },
                            onTriage = { triaging = true },
                        )
                        moreOnWeb(current.page.total, current.page.items.size)
                    } else {
                        if (current.page.items.isEmpty()) emptyStep(step)
                        items(current.page.items, key = { it.uid }) { item ->
                            TaskCard(item, taskMeta(item, step), rows, tasksViewModel, choices.task(item, step), busy == item.uid, expanded, { expanded = it })
                        }
                        moreOnWeb(current.page.total, current.page.items.size)
                    }
                    is StepContent.Inbox -> {
                        if (current.page.items.isEmpty()) emptyStep(step)
                        items(current.page.items, key = { it.uid }) { item ->
                            val link = remember(item, links) {
                                ch.nicolab.cadence.tasks.links.LinkExtractor.urls(item.text, 1).firstOrNull()?.let {
                                    RowLink(item.text, ReviewBacklog.linkFor(links, "inbox_item", item.uid, item.text))
                                }
                            }
                            ReviewCard(
                                title = item.text,
                                meta = item.createdAt?.let {
                                    stringResource(R.string.review_captured_on, formatReviewDay(it.atZone(ZoneId.systemDefault()).toLocalDate()))
                                },
                                link = link,
                                previews = tasksViewModel.linkPreviews,
                                expanded = expanded == "inbox:${item.uid}",
                                onToggle = { expanded = if (expanded == "inbox:${item.uid}") null else "inbox:${item.uid}" },
                                choices = choices.inbox(item),
                                busy = busy == "inbox:${item.uid}",
                            )
                        }
                        moreOnWeb(current.page.total, current.page.items.size)
                    }
                    is StepContent.Projects -> {
                        if (current.page.items.isEmpty()) emptyStep(step)
                        items(current.page.items, key = { it.uid }) { item ->
                            ReviewCard(
                                title = item.name,
                                meta = item.reasons.map { stringResource(reasonLabel(it)) }.joinToString(" · "),
                                link = null,
                                previews = tasksViewModel.linkPreviews,
                                expanded = expanded == "project:${item.uid}",
                                onToggle = { expanded = if (expanded == "project:${item.uid}") null else "project:${item.uid}" },
                                choices = choices.project(item),
                                busy = busy == "project:${item.uid}",
                                rail = projectColors[item.uid]?.let(::Color),
                            )
                        }
                    }
                    is StepContent.Week -> {
                        val week = current.week
                        item(key = "capacity") {
                            CapacityPanel(
                                planned = week.plannedMinutes,
                                capacity = week.capacityMinutes,
                                unestimated = week.unestimated,
                                onSet = {
                                    settingCapacity = week.capacityMinutes
                                    settingCapacityOpen = true
                                },
                            )
                        }
                        val all = week.committed + week.inView
                        if (all.size >= 2) {
                            item(key = "choose") {
                                SecondaryAction(
                                    stringResource(R.string.choose_open),
                                    modifier = Modifier.fillMaxWidth(),
                                    onClick = { choosing = all },
                                )
                            }
                        }
                        if (all.isEmpty()) emptyStep(step)
                        if (week.committed.isNotEmpty()) {
                            item(key = "committed-header") {
                                SectionHeader(title = stringResource(R.string.review_week_committed), count = week.committed.size)
                            }
                            items(week.committed, key = { "c:${it.uid}" }) { item ->
                                TaskCard(item, weekMeta(item), rows, tasksViewModel, choices.week(item, true), busy == item.uid, expanded, { expanded = it })
                            }
                        }
                        if (week.inView.isNotEmpty()) {
                            item(key = "view-header") {
                                SectionHeader(title = stringResource(R.string.review_week_in_view), count = week.inView.size)
                            }
                            items(week.inView, key = { "v:${it.uid}" }) { item ->
                                TaskCard(item, weekMeta(item), rows, tasksViewModel, choices.week(item, false), busy == item.uid, expanded, { expanded = it })
                            }
                        }
                    }
                }
                step.next?.let { next ->
                    item(key = "next") {
                        TertiaryAction(
                            stringResource(R.string.review_next, stringResource(stepLabel(next))),
                            modifier = Modifier.fillMaxWidth().padding(top = Space.md),
                            onClick = { expanded = null; viewModel.select(next) },
                        )
                    }
                }
            }
        }
    }

    quick?.let { state ->
        QuickReviewScreen(
            state = state,
            rows = rows,
            viewModel = viewModel,
            previews = tasksViewModel.linkPreviews,
            choices = choices,
            onOpenTask = { openTaskUid = it },
        )
    }

    if (triaging) {
        LaterTriageScreen(
            items = laterTasks,
            rows = rows,
            order = laterGroups.flatMap { it.items },
            viewModel = viewModel,
            previews = tasksViewModel.linkPreviews,
            choices = choices,
            onOpenTask = { openTaskUid = it },
            onClose = { triaging = false },
        )
    }
    }
    when (val open = asking) {
        is Asking.NextTask -> NextTaskSheet(open.project, viewModel) { asking = null }
        is Asking.ReviewDate -> {
            val label = stringResource(R.string.review_action_review_on)
            TaskDatePickerDialog(
                initial = open.item.reviewOn ?: LocalDate.now().plusDays(30),
                onConfirm = {
                    asking = null
                    viewModel.decide(open.item, Decision.ReviewOn(it), label)
                },
                onDismiss = { asking = null },
            )
        }
        null -> Unit
    }
    choosing?.let { list ->
        val byUid = remember(list) { list.associateBy { it.uid } }
        ThisOrThatSheet(
            cards = list.map { ChoiceCard(it.uid, it.name, listOfNotNull(it.projectName, it.estimatedMinutes?.let(::estimateText)).joinToString(" · ")) },
            onChoose = { uid -> byUid[uid]?.let(viewModel::chooseToday); choosing = null },
            dismiss = { choosing = null },
        )
    }
    if (settingCapacityOpen) {
        CapacitySheet(
            current = settingCapacity,
            onPick = { viewModel.saveCapacity(it); settingCapacityOpen = false },
            dismiss = { settingCapacityOpen = false },
        )
    }
    openTaskUid?.let { uid ->
        TaskDetailSheet(taskUid = uid, viewModel = tasksViewModel, onDismiss = { openTaskUid = null })
    }
}

@Composable
private fun TaskCard(
    item: ReviewTask,
    meta: String,
    rows: RowContext,
    tasksViewModel: TasksViewModel,
    choices: List<Choice>,
    busy: Boolean,
    expanded: String?,
    onExpand: (String?) -> Unit,
) {
    val link = remember(item, rows) { rows.link(item) }
    ReviewCard(
        title = item.name,
        meta = meta,
        link = link,
        previews = tasksViewModel.linkPreviews,
        expanded = expanded == item.uid,
        onToggle = { onExpand(if (expanded == item.uid) null else item.uid) },
        choices = choices,
        busy = busy,
        rail = rows.rail(item),
        tags = rows.tags(item),
    )
}

/** « Plus tard » : filtre, « Trier un par un », puis les groupes par projet, pliables. */
private fun LazyListScope.laterList(
    items: List<ReviewTask>,
    groups: List<BacklogGroup>,
    query: String,
    open: Set<String>,
    labels: Triple<String, String, String>,
    rows: RowContext,
    viewModel: ReviewViewModel,
    tasksViewModel: TasksViewModel,
    choices: ReviewChoices,
    busy: String?,
    expanded: String?,
    onExpand: (String) -> Unit,
    onTriage: () -> Unit,
) {
    if (items.isEmpty()) {
        emptyStep(ReviewStep.LATER)
        return
    }
    val (todayLabel, laterLabel, noProject) = labels
    item(key = "later-tools") {
        Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            CadenceField(value = query, onValue = viewModel::filterLater, label = stringResource(R.string.review_later_filter), modifier = Modifier.fillMaxWidth())
            if (items.size >= 2) {
                Row { QuickPill(pluralStringResource(R.plurals.review_triage_start, items.size, items.size), onTriage) }
            }
        }
    }
    if (groups.isEmpty()) {
        item(key = "later-none") {
            Text(stringResource(R.string.review_later_no_match), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant, modifier = Modifier.padding(vertical = Space.lg))
        }
    }
    groups.forEach { group ->
        val isOpen = query.isNotBlank() || group.key in open
        item(key = "group:${group.key}") {
            GroupHeader(
                name = group.name ?: noProject,
                count = group.items.size,
                color = if (group.kind == BacklogGroup.Kind.PROJECT) group.items.firstNotNullOfOrNull { rows.rail(it) } else null,
                open = isOpen,
                onToggle = { viewModel.toggleGroup(group.key, open) },
            )
        }
        if (isOpen) {
            items(group.items, key = { it.uid }) { item ->
                SwipeDecision(
                    todayLabel = todayLabel,
                    laterLabel = laterLabel,
                    onToday = { viewModel.decide(item, Decision.Today, todayLabel) },
                    onLater = { viewModel.decide(item, Decision.ReviewIn30Days, laterLabel) },
                ) {
                    TaskCard(item, taskMeta(item, ReviewStep.LATER), rows, tasksViewModel, choices.later(item), busy == item.uid, expanded) { onExpand(item.uid) }
                }
            }
        }
    }
}

/** Les choix de chaque liste, dans l'ordre du web ; les mêmes servent aux lignes et au tri un par un. */
internal class ReviewChoices(
    val task: (ReviewTask, ReviewStep) -> List<Choice>,
    val later: (ReviewTask) -> List<Choice>,
    /** « Plus tard » dans la revue rapide : « Garder de côté » d'un toucher, l'idée regardée repart au bout. */
    val quickLater: (ReviewTask) -> List<Choice>,
    val week: (ReviewTask, Boolean) -> List<Choice>,
    val inbox: (ReviewInboxItem) -> List<Choice>,
    val project: (ReviewProject) -> List<Choice>,
)

@Composable
private fun rememberChoices(
    viewModel: ReviewViewModel,
    onOpenTask: (String) -> Unit,
    onOpenProject: (String) -> Unit,
    ask: (Asking) -> Unit,
): ReviewChoices {
    val today = stringResource(R.string.review_action_today)
    val todayShort = stringResource(R.string.review_action_today_short)
    val split = stringResource(R.string.review_action_split)
    val shortSession = stringResource(R.string.review_action_short_session)
    val later = stringResource(R.string.review_action_later)
    val drop = stringResource(R.string.review_action_drop)
    val keep = stringResource(R.string.review_action_keep)
    val week = stringResource(R.string.review_action_this_week)
    val inView = stringResource(R.string.review_action_in_view)
    val review30 = stringResource(R.string.review_action_review30)
    val reviewOn = stringResource(R.string.review_action_review_on)
    val keepParked = stringResource(R.string.review_action_keep_parked)
    val notWeek = stringResource(R.string.review_action_not_this_week)
    val outOfView = stringResource(R.string.review_action_out_of_view)
    val complete = stringResource(R.string.review_action_complete)
    val open = stringResource(R.string.review_action_open)
    val toTask = stringResource(R.string.review_action_to_task)
    val park = stringResource(R.string.review_action_park)
    val discard = stringResource(R.string.review_action_discard)
    val nextTask = stringResource(R.string.review_action_next_task)
    val openProject = stringResource(R.string.review_action_open_project)
    val hold = stringResource(R.string.review_action_hold)
    return remember(viewModel, today) {
        fun d(item: ReviewTask, decision: Decision, label: String) = { viewModel.decide(item, decision, label) }
        fun opening(item: ReviewTask) = Choice(Icons.Outlined.OpenInFull, open, more = true) { onOpenTask(item.uid) }
        val laterChoices = { item: ReviewTask ->
            listOf(
                Choice(Icons.Outlined.Today, todayShort, primary = true, run = d(item, Decision.Today, todayShort)),
                Choice(funnelIcon(FunnelStage.THIS_WEEK), week, run = d(item, Decision.ThisWeek, week)),
                Choice(funnelIcon(FunnelStage.LATER), later, run = d(item, Decision.ReviewIn30Days, review30)),
                Choice(Icons.Outlined.TaskAlt, complete) { viewModel.complete(item, complete) },
                Choice(Icons.Outlined.Block, drop, danger = true, run = d(item, Decision.Drop, drop)),
                Choice(Icons.Outlined.EventNote, reviewOn, more = true) { ask(Asking.ReviewDate(item)) },
                Choice(funnelIcon(FunnelStage.IN_VIEW), inView, more = true, run = d(item, Decision.InView, inView)),
                Choice(Icons.Outlined.Check, keepParked, more = true, run = d(item, Decision.KeepParked, keepParked)),
                opening(item),
            )
        }
        val quickLaterChoices = { item: ReviewTask ->
            listOf(
                Choice(Icons.Outlined.Today, todayShort, primary = true, run = d(item, Decision.Today, todayShort)),
                Choice(funnelIcon(FunnelStage.THIS_WEEK), week, run = d(item, Decision.ThisWeek, week)),
                Choice(Icons.Outlined.Check, keepParked, run = d(item, Decision.KeepParked, keepParked)),
                Choice(funnelIcon(FunnelStage.LATER), later, more = true, run = d(item, Decision.ReviewIn30Days, review30)),
                Choice(Icons.Outlined.EventNote, reviewOn, more = true) { ask(Asking.ReviewDate(item)) },
                Choice(funnelIcon(FunnelStage.IN_VIEW), inView, more = true, run = d(item, Decision.InView, inView)),
                Choice(Icons.Outlined.TaskAlt, complete, more = true) { viewModel.complete(item, complete) },
                Choice(Icons.Outlined.Block, drop, danger = true, more = true, run = d(item, Decision.Drop, drop)),
                opening(item),
            )
        }
        ReviewChoices(
            task = { item, step ->
                when (step) {
                    ReviewStep.PUSHED -> listOf(
                        Choice(Icons.Outlined.Today, today, primary = true, run = d(item, Decision.Today, today)),
                        Choice(Icons.Outlined.Timer, shortSession) { viewModel.shortSession(item, shortSession) },
                        Choice(Icons.Outlined.CallSplit, split) { onOpenTask(item.uid) },
                        Choice(funnelIcon(FunnelStage.LATER), later, run = d(item, Decision.Later, later)),
                        Choice(Icons.Outlined.Check, keep, run = d(item, Decision.Keep, keep)),
                        Choice(Icons.Outlined.Block, drop, danger = true, more = true, run = d(item, Decision.Drop, drop)),
                        opening(item),
                    )
                    ReviewStep.LATER -> laterChoices(item)
                    else -> listOf(
                        Choice(funnelIcon(FunnelStage.THIS_WEEK), week, primary = true, run = d(item, Decision.ThisWeek, week)),
                        Choice(funnelIcon(FunnelStage.IN_VIEW), inView, run = d(item, Decision.InView, inView)),
                        Choice(funnelIcon(FunnelStage.LATER), later, run = d(item, Decision.Later, later)),
                        Choice(Icons.Outlined.Check, keep, run = d(item, Decision.Keep, keep)),
                        Choice(Icons.Outlined.Block, drop, danger = true, more = true, run = d(item, Decision.Drop, drop)),
                        opening(item),
                    )
                }
            },
            later = laterChoices,
            quickLater = quickLaterChoices,
            week = { item, committed ->
                if (committed) listOf(
                    Choice(Icons.Outlined.Today, today, primary = true, run = d(item, Decision.Today, today)),
                    Choice(Icons.Outlined.VisibilityOff, notWeek, run = d(item, Decision.NotThisWeek, notWeek)),
                    Choice(funnelIcon(FunnelStage.LATER), later, run = d(item, Decision.Later, later)),
                    opening(item),
                ) else listOf(
                    Choice(funnelIcon(FunnelStage.THIS_WEEK), week, primary = true, run = d(item, Decision.ThisWeek, week)),
                    Choice(Icons.Outlined.VisibilityOff, outOfView, run = d(item, Decision.OutOfView, outOfView)),
                    Choice(funnelIcon(FunnelStage.LATER), later, run = d(item, Decision.Later, later)),
                    opening(item),
                )
            },
            inbox = { item ->
                listOf(
                    Choice(Icons.Outlined.Add, toTask, primary = true) { viewModel.toTask(item, null) },
                    Choice(funnelIcon(FunnelStage.THIS_WEEK), week) { viewModel.toTask(item, Decision.ThisWeek) },
                    Choice(funnelIcon(FunnelStage.LATER), park) { viewModel.toTask(item, Decision.Later) },
                    Choice(Icons.Outlined.Delete, discard, danger = true) { viewModel.discard(item) },
                )
            },
            project = { item ->
                listOf(
                    Choice(Icons.Outlined.Add, nextTask, primary = true) { ask(Asking.NextTask(item)) },
                    Choice(Icons.Outlined.Folder, openProject) { onOpenProject(item.uid) },
                    Choice(Icons.Outlined.PauseCircle, hold) { viewModel.holdProject(item) },
                    Choice(Icons.Outlined.Check, keep) { viewModel.keepProject(item) },
                )
            },
        )
    }
}

@Composable
private fun NextTaskSheet(project: ReviewProject, viewModel: ReviewViewModel, dismiss: () -> Unit) {
    var name by remember { mutableStateOf("") }
    CadenceSheet(title = project.name, subtitle = null, dismiss = dismiss) {
        Column(Modifier.navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(Space.md)) {
            CadenceField(value = name, onValue = { name = it }, label = stringResource(R.string.review_next_task_hint))
            PrimaryAction(stringResource(R.string.review_next_task_add), modifier = Modifier.fillMaxWidth(), enabled = name.isNotBlank()) {
                viewModel.addNextTask(project, name)
                dismiss()
            }
        }
    }
}

private fun LazyListScope.offlineLine(content: StepContent) {
    val fetchedAt = when (content) {
        is StepContent.Tasks -> content.fetchedAt.takeIf { content.fromCache }
        is StepContent.Inbox -> content.fetchedAt.takeIf { content.fromCache }
        is StepContent.Projects -> content.fetchedAt.takeIf { content.fromCache }
        is StepContent.Week -> content.fetchedAt.takeIf { content.fromCache }
        else -> null
    } ?: return
    item(key = "offline") {
        val palette = cadence
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.CloudOff, null, tint = palette.outline, modifier = Modifier.size(Size.iconSm))
            Spacer(Modifier.width(Space.sm))
            Text(
                stringResource(R.string.review_offline, formatReviewDay(fetchedAt.atZone(ZoneId.systemDefault()).toLocalDate())),
                style = MaterialTheme.typography.labelMedium,
                color = palette.outline,
            )
        }
    }
}

private fun LazyListScope.emptyStep(step: ReviewStep) {
    item(key = "empty") {
        Text(
            stringResource(emptyLabel(step)),
            style = MaterialTheme.typography.bodyMedium,
            color = cadence.onSurfaceVariant,
            modifier = Modifier.padding(vertical = Space.lg),
        )
    }
}

private fun LazyListScope.moreOnWeb(total: Int, shown: Int) {
    if (total <= shown) return
    item(key = "more") {
        Text(
            stringResource(R.string.review_more, total - shown),
            style = MaterialTheme.typography.labelMedium,
            color = cadence.outline,
        )
    }
}

@Composable
private fun CapacityPanel(planned: Int, capacity: Int?, unestimated: Int, onSet: () -> Unit) {
    val palette = cadence
    Panel {
        Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            Text(
                WeekCapacity.line(planned, capacity),
                style = MaterialTheme.typography.titleMedium,
                color = if (WeekCapacity.over(planned, capacity)) palette.warning else palette.onSurface,
            )
            if (unestimated > 0) {
                Text(
                    pluralStringResource(R.plurals.review_week_unestimated, unestimated, unestimated),
                    style = MaterialTheme.typography.labelMedium,
                    color = palette.onSurfaceVariant,
                )
            }
            TertiaryAction(stringResource(R.string.review_capacity_set), onClick = onSet)
        }
    }
}

@Composable
private fun CapacitySheet(current: Int?, onPick: (Int?) -> Unit, dismiss: () -> Unit) {
    CadenceSheet(title = stringResource(R.string.review_capacity_title), subtitle = null, dismiss = dismiss) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            (WeekCapacity.presets.map { it as Int? } + null).forEach { minutes ->
                val label = minutes?.let(::estimateText) ?: stringResource(R.string.review_capacity_none)
                ActionRow(
                    icon = if (minutes == current) Icons.Outlined.Check else Icons.Outlined.Today,
                    label = label,
                    tint = if (minutes == current) cadence.primary else cadence.onSurfaceVariant,
                ) { onPick(minutes) }
            }
        }
    }
}

internal fun stepLabel(step: ReviewStep): Int = when (step) {
    ReviewStep.UNDECIDED -> R.string.review_step_undecided
    ReviewStep.PUSHED -> R.string.review_step_pushed
    ReviewStep.PROJECTS -> R.string.review_step_projects
    ReviewStep.LATER -> R.string.review_step_later
    ReviewStep.STALE -> R.string.review_step_stale
    ReviewStep.WEEK -> R.string.review_step_week
}

private fun emptyLabel(step: ReviewStep): Int = when (step) {
    ReviewStep.UNDECIDED -> R.string.review_empty_undecided
    ReviewStep.PUSHED -> R.string.review_empty_pushed
    ReviewStep.PROJECTS -> R.string.review_empty_projects
    ReviewStep.LATER -> R.string.review_empty_later
    ReviewStep.STALE -> R.string.review_empty_stale
    ReviewStep.WEEK -> R.string.review_empty_week
}

internal fun reasonLabel(reason: ProjectReason): Int = when (reason) {
    ProjectReason.NO_NEXT_ACTION -> R.string.review_reason_no_next_action
    ProjectReason.QUIET -> R.string.review_reason_quiet
    ProjectReason.PUSHED_TASKS -> R.string.review_reason_pushed_tasks
}

private fun weekMeta(item: ReviewTask): String = listOfNotNull(item.projectName, item.estimatedMinutes?.let(::estimateText)).joinToString(" · ")

/** Contexte neutre d'une ligne ; dans « Plus tard », le projet est déjà le titre du groupe. */
@Composable
internal fun taskMeta(item: ReviewTask, step: ReviewStep): String {
    val parts = mutableListOf<String>()
    if (step != ReviewStep.LATER) item.projectName?.let(parts::add)
    when (step) {
        ReviewStep.PUSHED -> item.push?.let { push ->
            parts += pluralStringResource(R.plurals.review_pushed_meta, push.recentCount, push.recentCount)
            push.lastPlannedFor?.let { parts += stringResource(R.string.review_planned_for, formatReviewDay(it)) }
        }
        ReviewStep.LATER -> when {
            item.reviewDue -> parts += stringResource(R.string.review_due_now)
            item.reviewOn != null -> parts += stringResource(R.string.review_due_on, formatReviewDay(item.reviewOn))
        }
        ReviewStep.STALE -> item.lastActivityAt?.let {
            parts += stringResource(R.string.review_unchanged_since, formatReviewDay(it.atZone(ZoneId.systemDefault()).toLocalDate()))
        }
        else -> Unit
    }
    return parts.joinToString(" · ")
}

private fun estimateText(minutes: Int): String = ch.nicolab.cadence.tasks.planning.formatMinutes(minutes)
