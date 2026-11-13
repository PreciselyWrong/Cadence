package ch.nicolab.cadence.tasks.ui.proposals

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Comment
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.components.rememberAppSnackbarHostState
import ch.nicolab.cadence.designsystem.theme.Motion
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.proposals.DecisionGroup
import ch.nicolab.cadence.tasks.proposals.ProposalDto
import ch.nicolab.cadence.tasks.proposals.ProposalOp
import ch.nicolab.cadence.tasks.proposals.ProposalRepository
import ch.nicolab.cadence.tasks.proposals.ProposalStatus
import ch.nicolab.cadence.tasks.proposals.Proposals
import ch.nicolab.cadence.tasks.proposals.QuestionDto
import ch.nicolab.cadence.tasks.proposals.WeekDecision
import ch.nicolab.cadence.tasks.ui.TaskDatePickerDialog
import ch.nicolab.cadence.tasks.ui.TasksViewModel
import ch.nicolab.cadence.tasks.ui.tasksLocale
import java.io.IOException
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val dayChip: DateTimeFormatter = DateTimeFormatter.ofPattern("EEE d", tasksLocale)
private val dayHeader: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE d MMMM", tasksLocale)
private val periodDay: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", tasksLocale)
private val dueDay: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", tasksLocale)

/**
 * Feuille de la semaine prête : titre et sous-titre de l'agent, période, puis les tâches groupées par décision
 * courante. Chaque ligne montre la décision (par défaut celle de l'agent) ; un toucher ouvre le menu des choix.
 * Rien ne change avant « Appliquer » ; « Appliquer (N) » compte les décisions qui ne sont pas « garder ».
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProposalSheet(uid: String, onClose: () -> Unit) {
    val context = LocalContext.current
    val repo = remember(context) { ProposalRepository.of(context) }
    val tasks: TasksViewModel = viewModel()
    val snackbar = rememberAppSnackbarHostState()
    val scope = rememberCoroutineScope()
    val offline = stringResource(R.string.proposal_offline)
    val failed = stringResource(R.string.proposal_error)
    var dto by remember(uid) { mutableStateOf<ProposalDto?>(null) }
    var loadFailed by remember(uid) { mutableStateOf(false) }
    // Incrémenté à chaque réponse envoyée : la boucle de lecture repart et attend la nouvelle version.
    var version by remember(uid) { mutableIntStateOf(0) }
    // Décisions choisies par l'utilisateur ; une ligne absente garde la décision de l'agent. Remises à zéro par une réponse.
    var chosen by remember(uid, version) { mutableStateOf(emptyMap<String, WeekDecision>()) }
    // Tâche dont le menu de décision est ouvert, puis tâche dont la date est choisie dans le sélecteur.
    var menuFor by remember(uid) { mutableStateOf<String?>(null) }
    var dateFor by remember(uid) { mutableStateOf<String?>(null) }
    var replying by rememberSaveable(uid) { mutableStateOf(false) }
    var reply by rememberSaveable(uid) { mutableStateOf("") }
    var busy by remember(uid) { mutableStateOf(false) }
    // Remarques par tâche, et tâches dont le champ de remarque est ouvert ; remises à zéro par une réponse.
    var notes by remember(uid, version) { mutableStateOf(emptyMap<String, String>()) }
    var noteOpen by remember(uid, version) { mutableStateOf(emptySet<String>()) }

    LaunchedEffect(uid, version) {
        while (true) {
            val result = repo.detail(uid)
            result.onSuccess {
                dto = it
                loadFailed = false
            }.onFailure { loadFailed = dto == null }
            val status = result.getOrNull()?.status ?: dto?.status
            if (ProposalStatus.of(status) != ProposalStatus.PENDING) break
            delay(PROPOSAL_POLL_MS)
        }
    }

    val current = dto
    val status = ProposalStatus.of(current?.status)
    val changes = remember(current) { Proposals.weekChanges(current?.answer) }
    val sections = remember(changes, chosen) { Proposals.sections(changes, chosen) }
    val names = remember(current) { Proposals.factTasks(current?.facts) }
    val period = remember(current) { periodOf(current) }
    val pending = Proposals.pendingCount(changes, chosen)
    val counts = Proposals.sendCounts(changes, chosen, notes)

    fun failure(error: Throwable): String = if (error is IOException) offline else failed

    fun sendReply(text: String) {
        scope.launch {
            busy = true
            repo.reply(uid, text)
                .onSuccess { version++ }
                .onFailure { snackbar.showSnackbar(failure(it)) }
            busy = false
        }
    }

    fun applyChanges() {
        scope.launch {
            busy = true
            repo.apply(uid, Proposals.weekApplyBody(changes, chosen))
                .onSuccess { outcome ->
                    tasks.requestSync()
                    onClose()
                    val message = if (outcome.failed == 0) {
                        context.resources.getQuantityString(R.plurals.proposal_applied, outcome.applied, outcome.applied)
                    } else {
                        context.getString(R.string.proposal_applied_partial, outcome.applied, outcome.failed)
                    }
                    snackbar.showSnackbar(message)
                }
                .onFailure { snackbar.showSnackbar(failure(it)) }
            busy = false
        }
    }

    fun sendNotes() {
        scope.launch {
            busy = true
            repo.send(uid, Proposals.sendBody(changes, chosen, notes))
                .onSuccess {
                    tasks.requestSync()
                    val returned = counts.returned
                    onClose()
                    snackbar.showSnackbar(context.resources.getQuantityString(R.plurals.proposal_returned, returned, returned))
                }
                .onFailure { snackbar.showSnackbar(failure(it)) }
            busy = false
        }
    }

    fun ignore() {
        scope.launch {
            repo.dismiss(uid).onFailure { snackbar.showSnackbar(failure(it)) }
            onClose()
        }
    }

    val ready = status == ProposalStatus.READY
    CadenceSheet(
        title = Proposals.headlineOf(current?.answer) ?: stringResource(R.string.proposal_title),
        subtitle = if (ready) Proposals.subtitleOf(current?.answer) else null,
        dismiss = onClose,
    ) {
        when {
            current == null && loadFailed -> SheetNote(offline)
            current == null -> SheetNote(stringResource(R.string.proposal_loading))
            status == ProposalStatus.PENDING -> {
                SheetNote(stringResource(R.string.proposal_preparing))
                TertiaryAction(stringResource(R.string.proposal_later), onClick = onClose)
            }
            ready -> {
                period?.let { PeriodPill(it, Modifier.padding(top = Space.md)) }
                current.answer?.questions.orEmpty().forEach { question ->
                    QuestionBlock(question, enabled = !busy) { choice -> sendReply(Proposals.questionReply(question, choice)) }
                }
                if (changes.isEmpty()) {
                    SheetNote(stringResource(R.string.proposal_nothing))
                } else {
                    LazyColumn(
                        Modifier.fillMaxWidth().padding(top = Space.sm).heightIn(max = SECTIONS_MAX_HEIGHT),
                        contentPadding = PaddingValues(bottom = Space.sm),
                    ) {
                        sections.forEach { section ->
                            item(key = "group-${section.group}") {
                                GroupHeader(section.group, Modifier.animateItem())
                            }
                            items(section.changes, key = { it.taskUid }) { change ->
                                val task = names[change.taskUid]
                                ChangeRow(
                                    name = task?.name?.takeIf { it.isNotBlank() } ?: stringResource(R.string.proposal_unknown_task),
                                    tag = task?.goal ?: task?.area,
                                    reason = change.reason,
                                    decision = Proposals.decision(change, chosen),
                                    modified = Proposals.isModified(change, chosen),
                                    noted = Proposals.hasNote(change, notes),
                                    noteOpen = change.taskUid in noteOpen,
                                    note = notes[change.taskUid].orEmpty(),
                                    enabled = !busy,
                                    onChoose = { menuFor = change.taskUid },
                                    onRestore = { chosen = Proposals.restore(chosen, change.taskUid) },
                                    onToggleNote = {
                                        noteOpen = if (change.taskUid in noteOpen) noteOpen - change.taskUid else noteOpen + change.taskUid
                                    },
                                    onNote = { text ->
                                        notes = if (text.isEmpty()) {
                                            notes - change.taskUid
                                        } else {
                                            notes + (change.taskUid to text.take(Proposals.NOTE_MAX_LENGTH))
                                        }
                                    },
                                    modifier = Modifier.animateItem(),
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(Space.md))
                if (counts.returned == 0) {
                    PrimaryAction(
                        stringResource(R.string.proposal_apply, pending),
                        modifier = Modifier.fillMaxWidth(),
                        enabled = pending > 0 && !busy,
                        onClick = ::applyChanges,
                    )
                } else {
                    Text(
                        stringResource(R.string.proposal_send_counts, counts.applied, counts.returned),
                        style = MaterialTheme.typography.labelMedium,
                        color = cadence.onSurfaceVariant,
                        modifier = Modifier.fillMaxWidth().padding(bottom = Space.xs),
                    )
                    PrimaryAction(
                        stringResource(R.string.proposal_send),
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !busy,
                        onClick = ::sendNotes,
                    )
                }
                Row(
                    Modifier.fillMaxWidth().padding(top = Space.sm),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TertiaryAction(stringResource(R.string.proposal_reply), onClick = { replying = !replying })
                    TertiaryAction(stringResource(R.string.proposal_ignore), onClick = ::ignore)
                }
                if (replying) {
                    CadenceField(
                        value = reply,
                        onValue = { reply = it },
                        label = stringResource(R.string.proposal_reply_hint),
                        enabled = !busy,
                    )
                    SecondaryAction(
                        stringResource(R.string.proposal_send),
                        modifier = Modifier.fillMaxWidth().padding(top = Space.sm),
                        enabled = reply.isNotBlank() && !busy,
                        onClick = {
                            sendReply(reply.trim())
                            reply = ""
                            replying = false
                        },
                    )
                }
            }
            else -> {
                SheetNote(if (status == ProposalStatus.FAILED) failed else stringResource(R.string.proposal_closed))
                TertiaryAction(stringResource(R.string.proposal_later), onClick = onClose)
            }
        }
    }

    val menuChange = menuFor?.let { taskUid -> changes.firstOrNull { it.taskUid == taskUid } }
    if (menuChange != null) {
        val task = names[menuChange.taskUid]
        val options = remember(period) { Proposals.menuOptions(period?.first, period?.second) }
        val currentDecision = Proposals.decision(menuChange, chosen)
        CadenceSheet(
            title = task?.name?.takeIf { it.isNotBlank() } ?: stringResource(R.string.proposal_unknown_task),
            subtitle = null,
            dismiss = { menuFor = null },
        ) {
            FlowRow(
                Modifier.fillMaxWidth().padding(top = Space.sm, bottom = Space.lg),
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
                verticalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                options.forEach { option ->
                    ChoiceChip(
                        label = optionLabel(option),
                        selected = option == currentDecision,
                        onClick = {
                            chosen = Proposals.choose(chosen, menuChange, option)
                            menuFor = null
                        },
                    )
                }
                ChoiceChip(
                    label = stringResource(R.string.proposal_op_other_date),
                    selected = false,
                    onClick = { dateFor = menuChange.taskUid },
                )
            }
        }
    }

    val pickedChange = dateFor?.let { taskUid -> changes.firstOrNull { it.taskUid == taskUid } }
    if (pickedChange != null) {
        TaskDatePickerDialog(
            initial = (Proposals.decision(pickedChange, chosen).date ?: period?.first) ?: LocalDate.now(),
            onConfirm = { day ->
                chosen = Proposals.choose(chosen, pickedChange, WeekDecision(ProposalOp.PLAN_DAY, day))
                dateFor = null
                menuFor = null
            },
            onDismiss = { dateFor = null },
        )
    }
}

/** Période de la réponse (début et fin), ou null si l'une des deux dates manque. */
private fun periodOf(dto: ProposalDto?): Pair<LocalDate, LocalDate>? {
    val start = dto?.periodStart?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() } ?: return null
    val end = dto.periodEnd?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() } ?: return null
    return start to end
}

@Composable
private fun PeriodPill(period: Pair<LocalDate, LocalDate>, modifier: Modifier = Modifier) {
    val label = "${period.first.format(periodDay)} – ${period.second.format(periodDay)}"
    Box(
        modifier
            .clip(Radius.Pill)
            .background(cadence.containerHigh)
            .padding(horizontal = Space.md, vertical = Space.xs),
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = cadence.onSurfaceVariant)
    }
}

@Composable
private fun SheetNote(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        color = cadence.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth().padding(vertical = Space.sm),
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun QuestionBlock(question: QuestionDto, enabled: Boolean, onChoice: (String) -> Unit) {
    Text(
        question.text,
        style = MaterialTheme.typography.titleSmall,
        color = cadence.onSurface,
        modifier = Modifier.fillMaxWidth().padding(top = Space.md),
    )
    FlowRow(
        Modifier.fillMaxWidth().padding(top = Space.xs),
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
        verticalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        question.choices.forEach { choice ->
            ChoiceChip(choice, selected = false, onClick = { if (enabled) onChoice(choice) })
        }
    }
}

@Composable
private fun GroupHeader(group: DecisionGroup, modifier: Modifier = Modifier) {
    Text(
        groupLabel(group),
        style = MaterialTheme.typography.labelMedium,
        color = cadence.outline,
        modifier = modifier.fillMaxWidth().padding(top = Space.md, bottom = Space.xs),
    )
}

@Composable
private fun ChangeRow(
    name: String,
    tag: String?,
    reason: String,
    decision: WeekDecision,
    modified: Boolean,
    noted: Boolean,
    noteOpen: Boolean,
    note: String,
    enabled: Boolean,
    onChoose: () -> Unit,
    onRestore: () -> Unit,
    onToggleNote: () -> Unit,
    onNote: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().padding(vertical = Space.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    name,
                    style = MaterialTheme.typography.bodyLarge,
                    color = cadence.onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                tag?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.labelSmall,
                        color = cadence.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = Space.xs),
                    )
                }
                if (reason.isNotBlank()) {
                    Text(
                        reason,
                        style = MaterialTheme.typography.bodySmall,
                        color = cadence.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (modified) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            stringResource(R.string.proposal_modified),
                            style = MaterialTheme.typography.labelMedium,
                            color = cadence.primary,
                        )
                        TertiaryAction(stringResource(R.string.proposal_restore), onClick = onRestore)
                    }
                }
            }
            Spacer(Modifier.width(Space.md))
            if (noted) {
                ReviewChip()
            } else {
                DecisionChip(label = chipLabel(decision), modified = modified, onClick = onChoose)
            }
            IconButton(onClick = onToggleNote) {
                Icon(
                    Icons.Outlined.Comment,
                    contentDescription = stringResource(R.string.proposal_note),
                    tint = if (noted || noteOpen) cadence.primary else cadence.onSurfaceVariant,
                )
            }
        }
        if (noteOpen) {
            CadenceField(
                value = note,
                onValue = onNote,
                label = stringResource(R.string.proposal_note_hint),
                support = "${note.length}/${Proposals.NOTE_MAX_LENGTH}",
                enabled = enabled,
                modifier = Modifier.padding(bottom = Space.sm),
            )
        }
    }
}

/** Remplace la décision d'une tâche remarquée : elle ne part pas avec « Appliquer ». */
@Composable
private fun ReviewChip() {
    val palette = cadence
    Box(
        Modifier
            .clip(Radius.Chip)
            .background(palette.primaryContainer)
            .defaultMinSize(minHeight = 40.dp)
            .padding(horizontal = Space.md, vertical = Space.sm),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            stringResource(R.string.proposal_to_review),
            style = MaterialTheme.typography.labelLarge,
            color = palette.onPrimaryContainer,
            maxLines = 1,
        )
    }
}

@Composable
private fun DecisionChip(label: String, modified: Boolean, onClick: () -> Unit) {
    val palette = cadence
    Box(
        Modifier
            .clip(Radius.Chip)
            .background(if (modified) palette.primaryContainer else palette.containerHigh)
            .clickable(onClick = onClick)
            .defaultMinSize(minHeight = 40.dp)
            .padding(horizontal = Space.md, vertical = Space.sm),
        contentAlignment = Alignment.Center,
    ) {
        AnimatedContent(
            targetState = label,
            transitionSpec = { fadeTransition() },
            label = "decisionChip",
        ) { text ->
            Text(
                text,
                style = MaterialTheme.typography.labelLarge,
                color = if (modified) palette.onPrimaryContainer else palette.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

private fun fadeTransition() = fadeIn(Motion.quick()).togetherWith(fadeOut(Motion.quick()))

@Composable
private fun groupLabel(group: DecisionGroup): String = when (group) {
    is DecisionGroup.Day -> group.date.format(dayHeader).replaceFirstChar { it.titlecase(tasksLocale) }
    DecisionGroup.ThisWeek -> stringResource(R.string.proposal_op_this_week)
    DecisionGroup.Later -> stringResource(R.string.proposal_op_later)
    is DecisionGroup.Due -> stringResource(R.string.proposal_op_due, group.date.format(dueDay))
    DecisionGroup.Drop -> stringResource(R.string.proposal_op_drop)
    DecisionGroup.Keep -> stringResource(R.string.proposal_op_keep)
}

/** Libellé court de la décision, dans la ligne. */
@Composable
private fun chipLabel(decision: WeekDecision): String = when (decision.op) {
    ProposalOp.PLAN_DAY -> decision.date?.format(dayChip).orEmpty()
    ProposalOp.THIS_WEEK -> stringResource(R.string.proposal_op_this_week)
    ProposalOp.LATER -> stringResource(R.string.proposal_op_later)
    ProposalOp.DUE -> stringResource(R.string.proposal_chip_due, decision.date?.format(dueDay).orEmpty())
    ProposalOp.DROP -> stringResource(R.string.proposal_op_drop)
    ProposalOp.KEEP -> stringResource(R.string.proposal_chip_keep)
}

/** Libellé d'une option du menu, en toutes lettres. */
@Composable
private fun optionLabel(option: WeekDecision): String = when (option.op) {
    ProposalOp.PLAN_DAY -> option.date?.format(dayChip).orEmpty()
    ProposalOp.THIS_WEEK -> stringResource(R.string.proposal_op_this_week)
    ProposalOp.LATER -> stringResource(R.string.proposal_op_later)
    ProposalOp.DUE -> stringResource(R.string.proposal_op_due, option.date?.format(dueDay).orEmpty())
    ProposalOp.DROP -> stringResource(R.string.proposal_op_drop)
    ProposalOp.KEEP -> stringResource(R.string.proposal_op_keep)
}

private val SECTIONS_MAX_HEIGHT = 460.dp
