package ch.nicolab.cadence.tasks.ui.proposals

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceScrollSheet
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
import ch.nicolab.cadence.tasks.proposals.DayLoad
import ch.nicolab.cadence.tasks.proposals.ProposalDto
import ch.nicolab.cadence.tasks.proposals.ProposalOp
import ch.nicolab.cadence.tasks.proposals.ProposalRepository
import ch.nicolab.cadence.tasks.proposals.ProposalStatus
import ch.nicolab.cadence.tasks.proposals.Proposals
import ch.nicolab.cadence.tasks.proposals.QuestionDto
import ch.nicolab.cadence.tasks.proposals.SheetSection
import ch.nicolab.cadence.tasks.proposals.WeekCounts
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
private val dayHeader: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE d", tasksLocale)
private val periodDay: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", tasksLocale)
private val dueDay: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", tasksLocale)

/** Largeur d'une case de jour quand la période en compte plus de sept : la bande défile. */
private val WideDayCell = 64.dp

/**
 * Feuille de la semaine prête (`docs/47-proposals.md`, « Week sheet v2 ») : titre et sous-titre de l'agent, période,
 * bande des jours, puis toutes les tâches des faits en trois sections (Échues, Par jour, Plus loin), dans un seul
 * défilement ; « Envoyer » ou « Appliquer » reste épinglé en bas. Un toucher sur la décision d'une ligne ouvre,
 * sous la ligne, le jour choisi et les choix. Rien ne change avant « Appliquer ».
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
    // Réponses préparées aux questions (question id → choix) : envoyées avec « Envoyer », jamais seules.
    var answers by remember(uid, version) { mutableStateOf(emptyMap<String, String>()) }

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
    val factTasks = remember(current) { Proposals.factTasks(current?.facts) }
    val rows = remember(current) { Proposals.weekRows(factTasks, Proposals.weekChanges(current?.answer)) }
    val sections = remember(rows, chosen, tasks) { Proposals.sections(rows, chosen, factTasks) }
    val period = remember(current) { periodOf(current) }
    val loads = remember(current) { Proposals.dayLoads(current?.days, current?.facts) }
    val today = remember(current) { Proposals.factToday(current?.facts) }
    val pending = Proposals.pendingCount(rows, chosen)
    val counts = Proposals.counts(rows, chosen, notes)
    val sending = Proposals.needsSend(counts, answers)

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
            repo.apply(uid, Proposals.weekApplyBody(rows, chosen))
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
            repo.send(uid, Proposals.sendBody(rows, chosen, notes, answers))
                .onSuccess {
                    tasks.requestSync()
                    val returned = counts.returned
                    onClose()
                    val message = if (returned == 0) {
                        context.getString(R.string.proposal_sent)
                    } else {
                        context.resources.getQuantityString(R.plurals.proposal_returned, returned, returned)
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

    val ready = status == ProposalStatus.READY
    val menuChange = menuFor?.let { taskUid -> rows.firstOrNull { it.taskUid == taskUid } }
    val focus = menuChange?.let { Proposals.focusDay(Proposals.decision(it, chosen), period) }
    val footer: (@Composable ColumnScope.() -> Unit)? = when {
        current == null -> null
        ready -> {
            {
                WeekCountsLine(counts)
                if (!sending) {
                    PrimaryAction(
                        stringResource(R.string.proposal_apply, pending),
                        modifier = Modifier.fillMaxWidth(),
                        enabled = pending > 0 && !busy,
                        onClick = ::applyChanges,
                    )
                } else {
                    PrimaryAction(
                        stringResource(R.string.proposal_send),
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !busy,
                        onClick = ::sendNotes,
                    )
                }
            }
        }
        else -> {
            { TertiaryAction(stringResource(R.string.proposal_later), onClick = onClose) }
        }
    }
    CadenceScrollSheet(
        title = Proposals.headlineOf(current?.answer) ?: stringResource(R.string.proposal_title),
        subtitle = if (ready) Proposals.subtitleOf(current?.answer) else null,
        dismiss = onClose,
        footer = footer,
    ) {
        when {
            current == null && loadFailed -> item { SheetNote(offline) }
            current == null -> item { SheetNote(stringResource(R.string.proposal_loading)) }
            status == ProposalStatus.PENDING -> item { SheetNote(stringResource(R.string.proposal_preparing)) }
            ready -> {
                period?.let { item(key = "period") { PeriodPill(it, Modifier.padding(top = Space.md)) } }
                if (loads.isNotEmpty()) item(key = "days") { DayStrip(loads, focus) }
                current.answer?.questions.orEmpty().forEach { question ->
                    item(key = "question-${question.id}") {
                        Column(Modifier.fillMaxWidth()) {
                            QuestionBlock(
                                question,
                                chosen = answers[question.id],
                                enabled = !busy,
                            ) { choice -> answers = Proposals.chooseAnswer(answers, question.id, choice) }
                        }
                    }
                }
                if (rows.isEmpty()) {
                    item { SheetNote(stringResource(R.string.proposal_nothing)) }
                } else {
                    sections.forEach { group ->
                        item(key = "section-${group.section}") {
                            SectionHeader(
                                group.section,
                                count = group.changes.size.takeIf { group.section == SheetSection.OVERDUE },
                                modifier = Modifier.animateItem(),
                            )
                        }
                        group.changes.forEach { change ->
                            val task = factTasks[change.taskUid]
                            val open = menuFor == change.taskUid
                            item(key = "row-${change.taskUid}") {
                                ChangeRow(
                                    name = task?.name?.takeIf { it.isNotBlank() } ?: stringResource(R.string.proposal_unknown_task),
                                    late = task?.let { latenessLabel(Proposals.lateness(it, today)) },
                                    reason = change.reason,
                                    dotColor = sectionDotColor(group.section),
                                    decision = Proposals.decision(change, chosen),
                                    modified = Proposals.isModified(change, chosen),
                                    noted = Proposals.hasNote(change, notes),
                                    noteOpen = change.taskUid in noteOpen,
                                    note = notes[change.taskUid].orEmpty(),
                                    enabled = !busy,
                                    onChoose = { menuFor = if (open) null else change.taskUid },
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
                            if (open) {
                                item(key = "picker-${change.taskUid}") {
                                    DayPicker(
                                        focus = focus,
                                        day = loads.firstOrNull { it.date == focus },
                                        currentDecision = Proposals.decision(change, chosen),
                                        options = remember(period) { Proposals.menuOptions(period?.first, period?.second) },
                                        loads = loads,
                                        onChoose = { option ->
                                            chosen = Proposals.choose(chosen, change, option)
                                            menuFor = null
                                        },
                                        onOtherDate = { dateFor = change.taskUid },
                                    )
                                }
                            }
                        }
                    }
                }
                item(key = "replies") {
                    Column(Modifier.fillMaxWidth()) {
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
                }
            }
            else -> item { SheetNote(if (status == ProposalStatus.FAILED) failed else stringResource(R.string.proposal_closed)) }
        }
    }

    val pickedChange = dateFor?.let { taskUid -> rows.firstOrNull { it.taskUid == taskUid } }
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
private fun QuestionBlock(question: QuestionDto, chosen: String?, enabled: Boolean, onChoice: (String) -> Unit) {
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
            ChoiceChip(choice, selected = choice == chosen, onClick = { if (enabled) onChoice(choice) })
        }
    }
}

@Composable
private fun SectionHeader(section: SheetSection, count: Int?, modifier: Modifier = Modifier) {
    val palette = cadence
    val overdue = section == SheetSection.OVERDUE
    Row(
        modifier.fillMaxWidth().padding(top = Space.md, bottom = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        Text(
            sectionLabel(section).uppercase(tasksLocale),
            style = MaterialTheme.typography.labelMedium,
            color = if (overdue) palette.warning else palette.outline,
        )
        count?.let {
            Box(
                Modifier
                    .clip(Radius.Pill)
                    .background(if (overdue) palette.warningContainer else palette.containerHigh)
                    .padding(horizontal = Space.sm),
            ) {
                Text(it.toString(), style = MaterialTheme.typography.labelMedium, color = palette.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun sectionLabel(section: SheetSection): String = when (section) {
    SheetSection.OVERDUE -> stringResource(R.string.proposal_section_overdue)
    SheetSection.DAYS -> stringResource(R.string.proposal_section_days)
    SheetSection.LATER -> stringResource(R.string.proposal_section_later)
}

@Composable
private fun sectionDotColor(section: SheetSection): Color = when (section) {
    SheetSection.OVERDUE -> cadence.warning
    SheetSection.DAYS -> cadence.primary
    SheetSection.LATER -> cadence.outline
}

/** « 7 changements · 2 restent tels quels », et les remarques renvoyées s'il y en a. */
@Composable
private fun WeekCountsLine(counts: WeekCounts) {
    Column(Modifier.fillMaxWidth().padding(bottom = Space.xs)) {
        Text(
            stringResource(
                R.string.proposal_counts,
                pluralStringResource(R.plurals.proposal_count_changes, counts.changes, counts.changes),
                pluralStringResource(R.plurals.proposal_count_kept, counts.kept, counts.kept),
            ),
            style = MaterialTheme.typography.labelMedium,
            color = cadence.onSurfaceVariant,
        )
        if (counts.returned > 0) {
            Text(
                pluralStringResource(R.plurals.proposal_returned, counts.returned, counts.returned),
                style = MaterialTheme.typography.labelMedium,
                color = cadence.onSurfaceVariant,
            )
        }
    }
}

/** Bande des jours de la période : charge, « Occupé » ou « — », et une barre de remplissage. Le jour du menu ouvert est marqué. */
@Composable
private fun DayStrip(days: List<DayLoad>, focus: LocalDate?) {
    val wide = days.size > 7
    val scroll = rememberScrollState()
    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = Space.md)
            .then(if (wide) Modifier.horizontalScroll(scroll) else Modifier),
        horizontalArrangement = Arrangement.spacedBy(Space.xs),
    ) {
        days.forEach { day ->
            DayCell(
                day,
                selected = day.date == focus,
                modifier = if (wide) Modifier.width(WideDayCell) else Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun DayCell(day: DayLoad, selected: Boolean, modifier: Modifier = Modifier) {
    val palette = cadence
    Column(
        modifier
            .clip(Radius.Chip)
            .background(palette.containerHigh)
            .then(if (selected) Modifier.border(2.dp, palette.primary, Radius.Chip) else Modifier)
            .padding(vertical = Space.sm, horizontal = Space.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            day.date.format(dayChip),
            style = MaterialTheme.typography.labelMedium,
            color = palette.onSurface,
            maxLines = 1,
        )
        Text(
            dayStripLabel(day),
            style = MaterialTheme.typography.labelSmall,
            color = palette.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Box(
            Modifier
                .padding(top = Space.xs)
                .fillMaxWidth()
                .height(4.dp)
                .clip(Radius.Pill)
                .background(palette.outlineVariant),
        ) {
            Box(
                Modifier
                    .fillMaxWidth(day.fill)
                    .fillMaxHeight()
                    .background(if (day.full) palette.warning else palette.primary),
            )
        }
    }
}

/** Sous une ligne : le jour choisi (charge, horaires, tâches, agenda), puis les choix. Rien n'est changé avant un choix. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DayPicker(
    focus: LocalDate?,
    day: DayLoad?,
    currentDecision: WeekDecision,
    options: List<WeekDecision>,
    loads: List<DayLoad>,
    onChoose: (WeekDecision) -> Unit,
    onOtherDate: () -> Unit,
) {
    val palette = cadence
    Column(
        Modifier
            .fillMaxWidth()
            .padding(bottom = Space.sm)
            .clip(Radius.Control)
            .background(palette.containerHigh)
            .padding(Space.md),
    ) {
        focus?.let {
            Text(
                it.format(dayHeader).replaceFirstChar { c -> c.titlecase(tasksLocale) },
                style = MaterialTheme.typography.titleSmall,
                color = palette.onSurface,
            )
        }
        day?.let { planLine(it) }?.let { line ->
            Text(line, style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant, modifier = Modifier.padding(top = Space.xs))
        }
        day?.work?.let { work ->
            val text = work.label?.let { stringResource(R.string.proposal_day_work_label, it, work.start, work.end) }
                ?: stringResource(R.string.proposal_day_work, work.start, work.end)
            Text(text, style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant)
        }
        day?.items?.forEach { item ->
            PickerLine(item.name, durationLabel(item.minutes))
        }
        val events = day?.events.orEmpty()
        if (events.isEmpty()) {
            Text(
                stringResource(R.string.proposal_nothing_on_agenda),
                style = MaterialTheme.typography.bodySmall,
                color = palette.onSurfaceVariant,
                modifier = Modifier.padding(top = Space.xs),
            )
        } else {
            events.forEach { event ->
                val time = if (event.allDay) {
                    stringResource(R.string.proposal_all_day)
                } else {
                    listOfNotNull(event.start, event.end).joinToString("–")
                }
                PickerLine(event.title, time)
            }
        }
        FlowRow(
            Modifier.fillMaxWidth().padding(top = Space.sm),
            horizontalArrangement = Arrangement.spacedBy(Space.sm),
            verticalArrangement = Arrangement.spacedBy(Space.sm),
        ) {
            options.forEach { option ->
                ChoiceChip(
                    label = optionLabel(option, loads),
                    selected = option == currentDecision,
                    onClick = { onChoose(option) },
                )
            }
            ChoiceChip(
                label = stringResource(R.string.proposal_op_other_date),
                selected = false,
                onClick = onOtherDate,
            )
        }
    }
}

@Composable
private fun planLine(day: DayLoad): String = when {
    day.loadMinutes == 0 -> stringResource(R.string.proposal_day_nothing)
    day.capacityMinutes != null -> stringResource(
        R.string.proposal_day_planned_of,
        durationLabel(day.loadMinutes),
        durationLabel(day.capacityMinutes),
    )
    else -> stringResource(R.string.proposal_day_planned, durationLabel(day.loadMinutes))
}

@Composable
private fun PickerLine(label: String, trailing: String) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = cadence.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f).padding(end = Space.sm),
        )
        Text(trailing, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
    }
}

/** « 30 min », « 1 h », « 1 h 30 ». */
@Composable
private fun durationLabel(minutes: Int): String = when {
    minutes < 60 -> stringResource(R.string.proposal_minutes, minutes)
    minutes % 60 == 0 -> stringResource(R.string.proposal_hours, minutes / 60)
    else -> stringResource(R.string.proposal_hours_minutes, minutes / 60, minutes % 60)
}

/** Libellé de la charge d'une case de la bande : « Occupé », « — » si rien n'est prévu, sinon la durée. */
@Composable
private fun dayStripLabel(day: DayLoad): String = when {
    day.occupied -> stringResource(R.string.proposal_busy)
    day.loadMinutes == 0 -> "—"
    else -> durationLabel(day.loadMinutes)
}

/** Charge d'un jour dans un choix : « occupé », « libre » ou la durée. */
@Composable
private fun dayLoadText(day: DayLoad): String = when {
    day.occupied -> stringResource(R.string.proposal_busy_lower)
    day.loadMinutes == 0 -> stringResource(R.string.proposal_free)
    else -> durationLabel(day.loadMinutes)
}

/** Retard d'une tâche : « hier », « N j » ; rien pour aujourd'hui ou une date inconnue. */
@Composable
private fun latenessLabel(days: Int?): String? = when {
    days == null || days <= 0 -> null
    days == 1 -> stringResource(R.string.proposal_late_yesterday)
    else -> stringResource(R.string.proposal_late_days, days)
}

@Composable
private fun ChangeRow(
    name: String,
    late: String?,
    reason: String,
    dotColor: Color,
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
            Box(Modifier.size(8.dp).clip(CircleShape).background(dotColor))
            Spacer(Modifier.width(Space.md))
            Column(Modifier.weight(1f)) {
                Text(
                    name,
                    style = MaterialTheme.typography.bodyLarge,
                    color = cadence.onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (late != null || reason.isNotBlank()) {
                    val warning = cadence.warning
                    Text(
                        buildAnnotatedString {
                            late?.let { withStyle(SpanStyle(color = warning)) { append(it) } }
                            if (late != null && reason.isNotBlank()) append(" · ")
                            append(reason)
                        },
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

/** Libellé court de la décision, dans la ligne. */
@Composable
private fun chipLabel(decision: WeekDecision): String = when (decision.op) {
    ProposalOp.PLAN_DAY -> decision.date?.format(dayChip).orEmpty()
    ProposalOp.THIS_WEEK -> stringResource(R.string.proposal_op_this_week)
    ProposalOp.NEXT_WEEK -> stringResource(R.string.proposal_op_next_week)
    ProposalOp.THIS_MONTH -> stringResource(R.string.proposal_op_this_month)
    ProposalOp.NEXT_MONTH -> stringResource(R.string.proposal_op_next_month)
    ProposalOp.LATER -> stringResource(R.string.proposal_op_later)
    ProposalOp.DUE -> stringResource(R.string.proposal_chip_due, decision.date?.format(dueDay).orEmpty())
    ProposalOp.DROP -> stringResource(R.string.proposal_op_drop)
    ProposalOp.KEEP -> stringResource(R.string.proposal_chip_keep)
}

/** Libellé d'une option du menu : un jour porte sa charge (« mar. 17 · 30 min », « jeu. 19 · libre »). */
@Composable
private fun optionLabel(option: WeekDecision, loads: List<DayLoad>): String = when (option.op) {
    ProposalOp.PLAN_DAY -> option.date?.let { date ->
        val day = loads.firstOrNull { it.date == date }
        if (day == null) date.format(dayChip) else stringResource(R.string.proposal_day_option, date.format(dayChip), dayLoadText(day))
    }.orEmpty()
    ProposalOp.THIS_WEEK -> stringResource(R.string.proposal_op_this_week)
    ProposalOp.NEXT_WEEK -> stringResource(R.string.proposal_op_next_week)
    ProposalOp.THIS_MONTH -> stringResource(R.string.proposal_op_this_month)
    ProposalOp.NEXT_MONTH -> stringResource(R.string.proposal_op_next_month)
    ProposalOp.LATER -> stringResource(R.string.proposal_op_later)
    ProposalOp.DUE -> stringResource(R.string.proposal_op_due, option.date?.format(dueDay).orEmpty())
    ProposalOp.DROP -> stringResource(R.string.proposal_op_drop)
    ProposalOp.KEEP -> stringResource(R.string.proposal_op_keep)
}
