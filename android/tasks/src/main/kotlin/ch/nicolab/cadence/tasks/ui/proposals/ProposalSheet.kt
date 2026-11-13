package ch.nicolab.cadence.tasks.ui.proposals

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TaskCheckbox
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.components.rememberAppSnackbarHostState
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.proposals.ChangeGroup
import ch.nicolab.cadence.tasks.proposals.FactTask
import ch.nicolab.cadence.tasks.proposals.ProposalDto
import ch.nicolab.cadence.tasks.proposals.ProposalOp
import ch.nicolab.cadence.tasks.proposals.ProposalRepository
import ch.nicolab.cadence.tasks.proposals.ProposalStatus
import ch.nicolab.cadence.tasks.proposals.Proposals
import ch.nicolab.cadence.tasks.proposals.QuestionDto
import ch.nicolab.cadence.tasks.proposals.WeekChange
import ch.nicolab.cadence.tasks.ui.TasksViewModel
import ch.nicolab.cadence.tasks.ui.formatReviewDay
import java.io.IOException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Feuille de la semaine prête : une phrase, les questions de l'agent (un choix envoie une réponse), les changements
 * groupés par jour avec une case chacun (cochées par défaut), puis « Appliquer (N) », « Répondre », « Plus tard »,
 * « Ignorer ». Rien ne change avant « Appliquer ». Tant que la réponse est en préparation, la feuille l'attend.
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
    // Cases décochées : tout est coché tant que l'utilisateur ne touche à rien.
    var unchecked by remember(uid) { mutableStateOf(emptySet<String>()) }
    var replying by rememberSaveable(uid) { mutableStateOf(false) }
    var reply by rememberSaveable(uid) { mutableStateOf("") }
    var busy by remember(uid) { mutableStateOf(false) }

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
    val groups = remember(changes) { Proposals.groupByDay(changes) }
    val names = remember(current) { Proposals.factTasks(current?.facts) }
    val kept = Proposals.checked(changes, unchecked)

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
            repo.apply(uid, Proposals.weekApplyBody(changes, unchecked))
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

    fun ignore() {
        scope.launch {
            repo.dismiss(uid).onFailure { snackbar.showSnackbar(failure(it)) }
            onClose()
        }
    }

    CadenceSheet(title = stringResource(R.string.proposal_title), subtitle = null, dismiss = onClose) {
        when {
            current == null && loadFailed -> SheetNote(offline)
            current == null -> SheetNote(stringResource(R.string.proposal_loading))
            status == ProposalStatus.PENDING -> {
                SheetNote(stringResource(R.string.proposal_preparing))
                TertiaryAction(stringResource(R.string.proposal_later), onClick = onClose)
            }
            status == ProposalStatus.READY -> {
                current.answer?.summary?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface, modifier = Modifier.fillMaxWidth())
                }
                current.answer?.questions.orEmpty().forEach { question ->
                    QuestionBlock(question, enabled = !busy) { choice -> sendReply(Proposals.questionReply(question, choice)) }
                }
                if (changes.isEmpty()) SheetNote(stringResource(R.string.proposal_nothing))
                groups.forEach { group ->
                    GroupBlock(group, names, unchecked) { taskUid -> unchecked = Proposals.toggle(unchecked, taskUid) }
                }
                Spacer(Modifier.height(Space.md))
                PrimaryAction(
                    stringResource(R.string.proposal_apply, kept.size),
                    modifier = Modifier.fillMaxWidth(),
                    enabled = kept.isNotEmpty() && !busy,
                    onClick = ::applyChanges,
                )
                Row(
                    Modifier.fillMaxWidth().padding(top = Space.sm),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TertiaryAction(stringResource(R.string.proposal_reply), onClick = { replying = !replying })
                    TertiaryAction(stringResource(R.string.proposal_later), onClick = onClose)
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
private fun GroupBlock(group: ChangeGroup, names: Map<String, FactTask>, unchecked: Set<String>, onToggle: (String) -> Unit) {
    Text(
        group.date?.let(::formatReviewDay) ?: stringResource(R.string.proposal_group_week),
        style = MaterialTheme.typography.labelMedium,
        color = cadence.outline,
        modifier = Modifier.fillMaxWidth().padding(top = Space.md),
    )
    group.changes.forEach { change ->
        ChangeRow(
            change = change,
            name = names[change.taskUid]?.name?.takeIf { it.isNotBlank() } ?: stringResource(R.string.proposal_unknown_task),
            checked = change.taskUid !in unchecked,
            onToggle = { onToggle(change.taskUid) },
        )
    }
}

@Composable
private fun ChangeRow(change: WeekChange, name: String, checked: Boolean, onToggle: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TaskCheckbox(checked = checked, onCheckedChange = { onToggle() }, contentDescription = name)
        Spacer(Modifier.width(Space.md))
        Column(Modifier.weight(1f)) {
            Text(name, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(opLabel(change), style = MaterialTheme.typography.labelMedium, color = cadence.onSurfaceVariant)
            if (change.reason.isNotBlank()) {
                Text(change.reason, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun opLabel(change: WeekChange): String = when (change.op) {
    ProposalOp.PLAN_DAY -> stringResource(R.string.proposal_op_plan_day)
    ProposalOp.THIS_WEEK -> stringResource(R.string.proposal_op_this_week)
    ProposalOp.LATER -> stringResource(R.string.proposal_op_later)
    ProposalOp.DUE -> stringResource(R.string.proposal_op_due, change.date?.let(::formatReviewDay).orEmpty())
    ProposalOp.DROP -> stringResource(R.string.proposal_op_drop)
}
