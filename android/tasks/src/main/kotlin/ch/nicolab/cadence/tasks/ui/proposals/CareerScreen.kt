@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package ch.nicolab.cadence.tasks.ui.proposals

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.components.rememberAppSnackbarHostState
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.proposals.CareerDecided
import ch.nicolab.cadence.tasks.proposals.CareerDecision
import ch.nicolab.cadence.tasks.proposals.CareerFollowup
import ch.nicolab.cadence.tasks.proposals.CareerKind
import ch.nicolab.cadence.tasks.proposals.CareerModel
import ch.nicolab.cadence.tasks.proposals.CareerOffer
import ch.nicolab.cadence.tasks.proposals.CareerOp
import ch.nicolab.cadence.tasks.proposals.CareerProposalDto
import ch.nicolab.cadence.tasks.proposals.CareerStat
import ch.nicolab.cadence.tasks.proposals.CareerTask
import ch.nicolab.cadence.tasks.proposals.ProposalRepository
import ch.nicolab.cadence.tasks.ui.TasksViewModel
import ch.nicolab.cadence.tasks.ui.tasksLocale
import java.io.IOException
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.launch

private val careerDay: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", tasksLocale)

/**
 * Carrière : relances, offres à décider et tâches proposées par l'agent, une décision à la fois.
 * En ligne seulement ; rien n'est gardé sur le téléphone. Chaque toucher envoie une décision, puis la liste est relue.
 */
@Composable
fun CareerScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val repo = remember(context) { ProposalRepository.of(context) }
    val tasks: TasksViewModel = viewModel()
    val uriHandler = LocalUriHandler.current
    val snackbar = rememberAppSnackbarHostState()
    val scope = rememberCoroutineScope()
    val offline = stringResource(R.string.proposal_offline)
    val failed = stringResource(R.string.proposal_error)
    var proposal by remember { mutableStateOf<CareerProposalDto?>(null) }
    var loaded by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var decidedOpen by rememberSaveable { mutableStateOf(false) }
    // Remarques par élément (clé `genre:id`) et éléments dont le champ est ouvert.
    val notes = remember { mutableStateMapOf<String, String>() }
    var noteOpen by remember { mutableStateOf(emptySet<String>()) }

    suspend fun load() {
        repo.career()
            .onSuccess {
                proposal = it
                loadError = null
            }
            .onFailure { loadError = if (it is IOException) offline else failed }
        loaded = true
    }

    LaunchedEffect(Unit) { load() }
    BackHandler(onBack = onBack)

    val view = remember(proposal) { CareerModel.view(proposal) }
    val isOffline = loadError == offline
    val actionsEnabled = !busy && !isOffline && proposal != null

    fun decide(kind: CareerKind, id: String, op: CareerOp, dueDate: String? = null) {
        val key = "${kind.wire}:$id"
        val uid = proposal?.uid ?: return
        val decision = CareerDecision.of(kind, id, op, note = notes[key], dueDate = dueDate) ?: return
        scope.launch {
            busy = true
            repo.decideCareer(uid, decision)
                .onSuccess {
                    tasks.requestSync()
                    notes.remove(key)
                    noteOpen = noteOpen - key
                    load()
                }
                .onFailure { snackbar.showSnackbar(if (it is IOException) offline else failed) }
            busy = false
        }
    }

    val palette = cadence
    Surface(Modifier.fillMaxSize(), color = palette.background, contentColor = palette.onSurface) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            Column(Modifier.padding(horizontal = Space.gutter)) {
                ScreenHeader(
                    title = view.headline ?: stringResource(R.string.career_title),
                    subtitle = view.subtitle,
                    onBack = onBack,
                    backDescription = stringResource(R.string.career_back),
                )
            }
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = Space.gutter, vertical = Space.sm),
                verticalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                loadError?.let { message ->
                    item(key = "error") { Text(message, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant) }
                }
                if (!loaded) {
                    item(key = "loading") { Text(stringResource(R.string.proposal_loading), style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant) }
                    return@LazyColumn
                }
                if (view.isEmpty && loadError == null) {
                    item(key = "empty") {
                        Text(stringResource(R.string.career_nothing), style = MaterialTheme.typography.titleMedium, color = palette.onSurfaceVariant, modifier = Modifier.padding(vertical = Space.lg))
                    }
                }
                if (view.stats.isNotEmpty()) item(key = "stats") { StatTiles(view.stats) }

                if (view.followups.isNotEmpty()) {
                    item(key = "h-followups") { SectionHeader(title = stringResource(R.string.career_followups), count = view.followups.size, modifier = Modifier.padding(top = Space.sm)) }
                    items(view.followups, key = { "f:${it.id}" }) { item ->
                        FollowupCard(
                            item = item,
                            enabled = actionsEnabled,
                            onOpenDraft = { uriHandler.openUri(it) },
                            onDecide = { op -> decide(CareerKind.FOLLOWUP, item.id, op) },
                        )
                    }
                }

                if (view.offers.isNotEmpty()) {
                    item(key = "h-offers") { SectionHeader(title = stringResource(R.string.career_offers), count = view.offers.size, modifier = Modifier.padding(top = Space.sm)) }
                    items(view.offers, key = { "o:${it.id}" }) { item ->
                        val key = "offer:${item.id}"
                        OfferCard(
                            item = item,
                            enabled = actionsEnabled,
                            noteOpen = key in noteOpen,
                            note = notes[key].orEmpty(),
                            onToggleNote = { noteOpen = if (key in noteOpen) noteOpen - key else noteOpen + key },
                            onNote = { notes[key] = it.take(CareerModel.NOTE_MAX_LENGTH) },
                            onOpen = { url -> uriHandler.openUri(url) },
                            onDecide = { op -> decide(CareerKind.OFFER, item.id, op) },
                        )
                    }
                }

                if (view.tasks.isNotEmpty()) {
                    item(key = "h-tasks") { SectionHeader(title = stringResource(R.string.career_tasks), count = view.tasks.size, modifier = Modifier.padding(top = Space.sm)) }
                    items(view.tasks, key = { "t:${it.id}" }) { item ->
                        TaskCard(
                            item = item,
                            enabled = actionsEnabled,
                            onDecide = { op -> decide(CareerKind.TASK, item.id, op, dueDate = item.dueDate?.toString()) },
                        )
                    }
                }

                if (view.decided.isNotEmpty()) {
                    item(key = "decided-toggle") {
                        TertiaryAction(
                            stringResource(R.string.career_decided, view.decided.size),
                            onClick = { decidedOpen = !decidedOpen },
                        )
                    }
                    if (decidedOpen) items(view.decided, key = { "d:${it.kind.wire}:${it.id}" }) { DecidedRow(it) }
                }
            }
        }
    }
}

/** Point d'entrée dans Bilan : ouvre l'écran de la carrière. */
@Composable
fun CareerEntryPanel(onOpen: () -> Unit) {
    val palette = cadence
    Panel(onClick = onOpen) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.career_title), style = MaterialTheme.typography.titleMedium, color = palette.onSurface)
                Text(stringResource(R.string.career_entry_text), style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
            }
            Spacer(Modifier.width(Space.sm))
            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = palette.onSurfaceVariant)
        }
    }
}

@Composable
private fun StatTiles(stats: List<CareerStat>) {
    val palette = cadence
    LazyRow(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
        items(stats) { stat ->
            Panel(Modifier.width(128.dp)) {
                Column {
                    Text(stat.value, style = MaterialTheme.typography.titleLarge, color = palette.onSurface)
                    Text(stat.label, style = MaterialTheme.typography.labelMedium, color = palette.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun FollowupCard(item: CareerFollowup, enabled: Boolean, onOpenDraft: (String) -> Unit, onDecide: (CareerOp) -> Unit) {
    val palette = cadence
    val applied = item.appliedAt?.let { stringResource(R.string.career_applied_on, it.format(careerDay)) }
    val meta = listOfNotNull(item.company?.takeIf(String::isNotBlank), applied).joinToString(" · ")
    Panel(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            Text(item.title, style = MaterialTheme.typography.titleMedium, color = palette.onSurface)
            if (meta.isNotBlank()) Text(meta, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
            item.note?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant) }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                item.draftUrl?.let { url -> SecondaryAction(stringResource(R.string.career_open_draft), enabled = enabled, onClick = { onOpenDraft(url) }) }
                PrimaryAction(stringResource(R.string.career_create_task), enabled = enabled, onClick = { onDecide(CareerOp.TASK) })
                SecondaryAction(stringResource(R.string.career_done), enabled = enabled, onClick = { onDecide(CareerOp.DONE) })
                TertiaryAction(stringResource(R.string.proposal_later), onClick = { if (enabled) onDecide(CareerOp.LATER) })
            }
        }
    }
}

@Composable
private fun OfferCard(
    item: CareerOffer,
    enabled: Boolean,
    noteOpen: Boolean,
    note: String,
    onToggleNote: () -> Unit,
    onNote: (String) -> Unit,
    onOpen: (String) -> Unit,
    onDecide: (CareerOp) -> Unit,
) {
    val palette = cadence
    val expires = item.expires?.let { stringResource(R.string.career_expires, it.format(careerDay)) }
    val details = listOfNotNull(item.location, item.rate, expires).joinToString(" · ")
    val title = listOfNotNull(item.title, item.company.takeIf(String::isNotBlank)).joinToString(" · ")
    val url = CareerModel.safeUrl(item.url)
    Panel(Modifier.fillMaxWidth(), onClick = url?.let { { onOpen(it) } }) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = palette.onSurface)
            if (details.isNotBlank()) Text(details, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
            if (item.fit.isNotBlank()) Text(item.fit, style = MaterialTheme.typography.bodyMedium, color = palette.onSurface)
            if (noteOpen) {
                CadenceField(
                    value = note,
                    onValue = onNote,
                    label = stringResource(R.string.career_note),
                    placeholder = stringResource(R.string.career_note_hint),
                    enabled = enabled,
                )
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                PrimaryAction(stringResource(R.string.career_apply), enabled = enabled, onClick = { onDecide(CareerOp.APPLY) })
                SecondaryAction(stringResource(R.string.career_skip), enabled = enabled, onClick = { onDecide(CareerOp.SKIP) })
                TertiaryAction(stringResource(R.string.proposal_later), onClick = { if (enabled) onDecide(CareerOp.LATER) })
                TertiaryAction(stringResource(R.string.career_note), onClick = onToggleNote)
            }
        }
    }
}

@Composable
private fun TaskCard(item: CareerTask, enabled: Boolean, onDecide: (CareerOp) -> Unit) {
    val palette = cadence
    val due = item.dueDate?.let { stringResource(R.string.career_due, it.format(careerDay)) }
    Panel(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            Text(item.name, style = MaterialTheme.typography.titleMedium, color = palette.onSurface)
            listOfNotNull(item.note?.takeIf(String::isNotBlank), due).forEach {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                PrimaryAction(stringResource(R.string.career_add), enabled = enabled, onClick = { onDecide(CareerOp.CREATE) })
                TertiaryAction(stringResource(R.string.proposal_ignore), onClick = { if (enabled) onDecide(CareerOp.SKIP) })
            }
        }
    }
}

@Composable
private fun DecidedRow(item: CareerDecided) {
    val palette = cadence
    val label = stringResource(decidedLabel(item.kind, item.op))
    Column(Modifier.fillMaxWidth().padding(vertical = Space.xs)) {
        Text(item.title, style = MaterialTheme.typography.bodyLarge, color = palette.onSurface)
        Text(label, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
        item.note?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant) }
    }
}

private fun decidedLabel(kind: CareerKind, op: CareerOp): Int = when (kind to op) {
    CareerKind.OFFER to CareerOp.APPLY -> R.string.career_op_applied
    CareerKind.OFFER to CareerOp.SKIP -> R.string.career_op_passed
    CareerKind.FOLLOWUP to CareerOp.DONE -> R.string.career_op_done
    CareerKind.FOLLOWUP to CareerOp.TASK -> R.string.career_op_task_created
    CareerKind.TASK to CareerOp.CREATE -> R.string.career_op_task_added
    CareerKind.TASK to CareerOp.SKIP -> R.string.career_op_ignored
    else -> R.string.proposal_later
}
