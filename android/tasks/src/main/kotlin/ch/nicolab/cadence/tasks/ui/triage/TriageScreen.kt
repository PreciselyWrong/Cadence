package ch.nicolab.cadence.tasks.ui.triage

import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.TaskAlt
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.EmptyState
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.components.rememberAppSnackbarHostState
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.autoclassify.AUTO_CLASSIFY_TYPE
import ch.nicolab.cadence.tasks.autoclassify.AutoClassifyPayload
import ch.nicolab.cadence.tasks.autoclassify.LINK_DUPLICATE_TYPE
import ch.nicolab.cadence.tasks.brief.QuestionDto
import ch.nicolab.cadence.tasks.triage.LINK_REVIEW_TYPE
import ch.nicolab.cadence.tasks.triage.LinkReviewDecision
import ch.nicolab.cadence.tasks.triage.LinkReviewPayload
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.triage.TriageActions
import ch.nicolab.cadence.tasks.triage.TriageItemDto
import ch.nicolab.cadence.tasks.triage.TriageTaskDto
import ch.nicolab.cadence.tasks.ui.TaskDateSheet
import ch.nicolab.cadence.tasks.ui.TaskDetailSheet
import ch.nicolab.cadence.tasks.ui.TasksViewModel
import ch.nicolab.cadence.tasks.ui.brief.BriefFormat
import ch.nicolab.cadence.tasks.ui.brief.PreciseAnswerSheet
import java.time.LocalDate
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Entrée dans Ma journée : n'apparaît que s'il y a quelque chose à trier. */
@Composable
internal fun TriageEntry(count: Int, onOpen: () -> Unit) {
    if (count <= 0) return
    Panel(modifier = Modifier.fillMaxWidth().padding(bottom = Space.sm), onClick = onOpen) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(R.string.triage_entry, count),
                style = MaterialTheme.typography.bodyLarge,
                color = cadence.onSurface,
                modifier = Modifier.weight(1f),
            )
            Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = cadence.onSurfaceVariant)
        }
    }
}

/** « À trier » ouvert directement (notification du classement). Même écran que depuis Ma journée. */
@Composable
fun TriageRoute(onBack: () -> Unit) = TriageScreen(today = LocalDate.now(), onBack = onBack)

/** Une proposition à la fois, avec sa raison en une ligne : valider, corriger, garder telle quelle ou passer. */
@Composable
internal fun TriageScreen(today: LocalDate, onBack: () -> Unit) {
    val viewModel: TriageViewModel = viewModel()
    val tasksViewModel: TasksViewModel = viewModel()
    val projects by tasksViewModel.projects.collectAsStateWithLifecycle()
    val items by viewModel.items.collectAsStateWithLifecycle()
    val queue by viewModel.queue.collectAsStateWithLifecycle()
    val snackbar = rememberAppSnackbarHostState()
    val undoLabel = stringResource(R.string.tasks_undo)
    var correcting by remember { mutableStateOf<TriageItemDto?>(null) }
    var opened by remember { mutableStateOf<String?>(null) }
    var precise by remember { mutableStateOf<Pair<TriageItemDto, QuestionDto>?>(null) }
    BackHandler(onBack = onBack)
    LaunchedEffect(viewModel) { viewModel.refresh() }
    LaunchedEffect(viewModel) {
        viewModel.notices.collect { notice ->
            snackbar.currentSnackbarData?.dismiss()
            launch {
                val result = snackbar.showSnackbar(notice.message, undoLabel, duration = SnackbarDuration.Short)
                if (result == SnackbarResult.ActionPerformed) notice.undo()
            }
        }
    }

    Surface(Modifier.fillMaxSize(), color = cadence.background, contentColor = cadence.onSurface) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            ScreenHeader(
                title = stringResource(R.string.triage_title),
                subtitle = items.size.takeIf { it > 0 }?.let { stringResource(R.string.triage_left, it) },
                onBack = onBack,
                backDescription = stringResource(R.string.brief_back),
            )
            val item = items.firstOrNull()
            if (item == null) {
                EmptyState(
                    icon = Icons.Outlined.TaskAlt,
                    title = stringResource(R.string.triage_empty_title),
                    message = stringResource(R.string.triage_empty_message),
                )
            } else {
                val task = item.taskUid?.let { queue?.tasks?.get(it) }
                Column(
                    Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.gutter, vertical = Space.md),
                    verticalArrangement = Arrangement.spacedBy(Space.md),
                ) {
                    AutoClassifyItem(
                        item = item,
                        projects = projects,
                        onAnswer = { choice -> viewModel.answerSuggestion(item, choice) },
                        onDismiss = { viewModel.dismissSuggestion(item) },
                        onSkip = { viewModel.skip(item) },
                        onLinkDecision = { decision -> viewModel.decideLink(item, decision) },
                    ) {
                        TriageCard(
                            item = item,
                            task = task,
                            onOpenTask = { uid -> opened = uid },
                            onValidate = { action, payload -> viewModel.apply(item, action, payload) },
                            onCorrect = { correcting = item },
                            onKeep = { viewModel.keep(item) },
                            onSkip = { viewModel.skip(item) },
                            onAnswer = { question, answer -> viewModel.answer(item, question, answer, today) },
                            onPrecise = { question -> precise = item to question },
                            onSlot = { accept ->
                                viewModel.answerSlot(item, TriageActions.field(item.payload, "slot_id"), accept)
                            },
                        )
                    }
                }
            }
        }
    }

    correcting?.let { item ->
        val task = item.taskUid?.let { queue?.tasks?.get(it) }
        if (task != null) {
            CorrectionSheet(
                task = task,
                today = today,
                onDismiss = { correcting = null },
                onChoose = { action, payload ->
                    correcting = null
                    viewModel.apply(item, action, payload)
                },
            )
        }
    }
    precise?.let { (item, question) ->
        PreciseAnswerSheet(
            question = question,
            onSend = { text ->
                viewModel.answer(item, question, text, today)
                precise = null
            },
            onDismiss = { precise = null },
        )
    }
    opened?.let { uid -> TaskDetailSheet(taskUid = uid, viewModel = tasksViewModel, onDismiss = { opened = null }) }
}

/** Carte du classement automatique, ou la carte habituelle pour tout autre élément (ou une charge illisible). */
@Composable
private fun AutoClassifyItem(
    item: TriageItemDto,
    projects: List<ProjectItem>,
    onAnswer: (JsonElement) -> Unit,
    onDismiss: () -> Unit,
    onSkip: () -> Unit,
    onLinkDecision: (LinkReviewDecision) -> Unit,
    fallback: @Composable () -> Unit,
) {
    when (item.type) {
        AUTO_CLASSIFY_TYPE -> AutoClassifyPayload.classify(item.payload)?.let { card ->
            ClassifyCardView(card, projects, onAnswer, onDismiss, onSkip)
        } ?: fallback()
        LINK_DUPLICATE_TYPE -> AutoClassifyPayload.duplicate(item.payload)?.let { card ->
            DuplicateCardView(card, onAnswer, onSkip)
        } ?: fallback()
        LINK_REVIEW_TYPE -> LinkReviewPayload.parse(item.payload)?.let { card ->
            LinkReviewCardView(card, onLinkDecision, onSkip)
        } ?: fallback()
        else -> fallback()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TriageCard(
    item: TriageItemDto,
    task: TriageTaskDto?,
    onOpenTask: (String) -> Unit,
    onValidate: (String, JsonElement?) -> Unit,
    onCorrect: () -> Unit,
    onKeep: () -> Unit,
    onSkip: () -> Unit,
    onAnswer: (QuestionDto, String) -> Unit,
    onPrecise: (QuestionDto) -> Unit,
    onSlot: (Boolean) -> Unit,
) {
    val question = item.question
    Panel(modifier = Modifier.fillMaxWidth(), onClick = task?.let { { onOpenTask(it.uid) } }) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            task?.let {
                Text(it.name, style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
                taskMeta(it)?.let { meta ->
                    Text(meta, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
                }
            }
            Text(question?.text ?: item.reason, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurface)
            item.details.forEach { line ->
                Text(line, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
            }
        }
    }
    if (item.action == TriageActions.ACCEPT_SLOT) {
        Text(
            listOf(TriageActions.field(item.payload, "title"), TriageActions.field(item.payload, "date")).joinToString(" · "),
            style = MaterialTheme.typography.bodySmall,
            color = cadence.onSurfaceVariant,
        )
        PrimaryAction(stringResource(R.string.triage_slot_accept), Modifier.fillMaxWidth(), onClick = { onSlot(true) })
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
            SecondaryAction(stringResource(R.string.triage_slot_refuse), onClick = { onSlot(false) })
            TertiaryAction(stringResource(R.string.triage_skip), onClick = onSkip)
        }
        return
    }
    if (question != null) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            SecondaryAction(stringResource(R.string.brief_answer_yes), onClick = { onAnswer(question, "yes") })
            SecondaryAction(stringResource(R.string.brief_answer_no), onClick = { onAnswer(question, "no") })
            TertiaryAction(stringResource(R.string.brief_answer_precise), onClick = { onPrecise(question) })
            TertiaryAction(stringResource(R.string.triage_skip), onClick = onSkip)
        }
        return
    }
    PrimaryAction(primaryLabel(item), Modifier.fillMaxWidth(), onClick = { onValidate(item.action, item.payload) })
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        SecondaryAction(stringResource(R.string.triage_correct), onClick = onCorrect)
        SecondaryAction(stringResource(R.string.triage_keep), onClick = onKeep)
        TertiaryAction(stringResource(R.string.triage_skip), onClick = onSkip)
    }
}

@Composable
private fun taskMeta(task: TriageTaskDto): String? = listOfNotNull(
    task.dueDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() }?.let { BriefFormat.dueChip(it) },
    task.projectName,
    stringResource(R.string.triage_recurring).takeIf { task.recurring },
    task.tags.takeIf { it.isNotEmpty() }?.joinToString(" ") { "#$it" },
).joinToString(" · ").ifBlank { null }

@Composable
private fun primaryLabel(item: TriageItemDto): String {
    val name = TriageActions.field(item.payload, "name")
    val due = TriageActions.field(item.payload, "due_date")
    return when {
        item.action == TriageActions.RENAME && name.isNotBlank() -> stringResource(R.string.triage_rename_to, name)
        item.action == TriageActions.SET_DUE && due.isNotBlank() ->
            stringResource(R.string.triage_due_on, runCatching { BriefFormat.dueChip(LocalDate.parse(due)) }.getOrDefault(due))
        else -> stringResource(actionLabel(item.action))
    }
}

@StringRes
private fun actionLabel(action: String): Int = when (action) {
    TriageActions.RENAME -> R.string.triage_action_rename
    TriageActions.SPLIT -> R.string.triage_action_split
    TriageActions.SET_DUE -> R.string.triage_action_due
    TriageActions.DONE -> R.string.triage_action_done
    TriageActions.DELETE -> R.string.triage_action_delete
    TriageActions.RECLASS -> R.string.triage_action_reclass
    TriageActions.TO_NOTE -> R.string.triage_action_note
    TriageActions.TO_PROJECT -> R.string.triage_action_project
    TriageActions.TO_HABIT -> R.string.triage_action_habit
    else -> R.string.triage_action_cancel
}

/** « Corriger » : choisir une autre action ; renommer, découper et dater demandent leur valeur. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CorrectionSheet(
    task: TriageTaskDto,
    today: LocalDate,
    onDismiss: () -> Unit,
    onChoose: (String, JsonElement?) -> Unit,
) {
    var editing by remember { mutableStateOf<String?>(null) }
    var text by remember { mutableStateOf("") }
    if (editing == TriageActions.SET_DUE) {
        TaskDateSheet(
            title = stringResource(R.string.triage_action_due),
            today = today,
            date = task.dueDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() },
            time = null,
            onApply = { day, _ ->
                day?.let { onChoose(TriageActions.SET_DUE, buildJsonObject { put("due_date", it.toString()) }) }
            },
            onDismiss = onDismiss,
        )
        return
    }
    CadenceSheet(title = task.name, subtitle = stringResource(R.string.triage_correct), dismiss = onDismiss) {
        when (editing) {
            TriageActions.RENAME -> {
                CadenceField(value = text, onValue = { text = it }, label = stringResource(R.string.triage_action_rename), modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(Space.md))
                PrimaryAction(stringResource(R.string.triage_action_rename), Modifier.fillMaxWidth(), enabled = text.isNotBlank()) {
                    onChoose(TriageActions.RENAME, buildJsonObject { put("name", text.trim()) })
                }
            }
            TriageActions.SPLIT -> {
                CadenceField(
                    value = text,
                    onValue = { text = it },
                    label = stringResource(R.string.triage_split_label),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(Space.md))
                PrimaryAction(stringResource(R.string.triage_action_split), Modifier.fillMaxWidth(), enabled = TriageActions.subtasks(text).isNotEmpty()) {
                    val names = TriageActions.subtasks(text).map { JsonPrimitive(it) }
                    onChoose(TriageActions.SPLIT, buildJsonObject { put("subtasks", JsonArray(names)) })
                }
            }
            else -> Column {
                TriageActions.choices(task).forEach { action ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = Size.touch)
                            .clickable(role = Role.Button) {
                                when (action) {
                                    TriageActions.RENAME -> {
                                        text = task.name
                                        editing = action
                                    }
                                    TriageActions.SPLIT -> {
                                        text = ""
                                        editing = action
                                    }
                                    TriageActions.SET_DUE -> editing = action
                                    else -> onChoose(action, null)
                                }
                            },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(stringResource(actionLabel(action)), style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface)
                    }
                }
            }
        }
        Spacer(Modifier.height(Space.lg))
    }
}
