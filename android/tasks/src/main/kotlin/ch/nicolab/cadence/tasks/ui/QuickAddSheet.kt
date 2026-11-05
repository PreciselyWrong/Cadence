@file:OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import ch.nicolab.cadence.designsystem.components.readableTintOf
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.res.pluralStringResource
import kotlinx.coroutines.delay
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.TagItem
import ch.nicolab.cadence.tasks.quickadd.QuickAddSeries
import ch.nicolab.cadence.tasks.quickadd.QuickAddSuggestions
import ch.nicolab.cadence.tasks.quickadd.SuggestionKind
import ch.nicolab.cadence.tasks.quickadd.TokenAtCursor
import ch.nicolab.cadence.tasks.quickadd.singleLineCapture
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.ErrorText
import ch.nicolab.cadence.designsystem.components.FieldGroup
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SegmentedTabs
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.model.TaskPriority
import ch.nicolab.cadence.tasks.quickadd.NamedRef
import ch.nicolab.cadence.tasks.quickadd.ParsedQuickAdd
import ch.nicolab.cadence.tasks.quickadd.QuickAddParser
import ch.nicolab.cadence.tasks.quickadd.QuickDates
import ch.nicolab.cadence.tasks.quickadd.TokenKind
import java.time.Clock
import java.time.LocalDate
import java.time.LocalTime
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** Destination d'une saisie : l'Inbox (à trier), une tâche, ou une note. */
enum class CaptureTarget { INBOX, TASK, NOTE }

private class ParsedChip(val icon: ImageVector, val label: String, val tint: Color? = null, val onRemove: () -> Unit)

/**
 * Ajout rapide d'une tâche, réutilisable par d'autres écrans (ex. l'activité du widget).
 * Un seul champ : la date, l'heure, `#étiquette`, `+projet` et `!1`-`!3` y sont reconnus au fil de la
 * frappe et montrés en pastilles retirables. « Plus d'options » ouvre le reste. Sans [onSave], la tâche
 * est créée directement ; [onSave] permet de la transformer (ex. convertir une entrée de la boîte de
 * réception). La fiche ne se ferme qu'après l'écriture ; en cas d'échec, les valeurs restent.
 */
@Composable
fun QuickAddSheet(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    initialName: String = "",
    onSave: (suspend (TaskDraft) -> Unit)? = null,
    /** Destinations proposées, la première choisie d'office ; vide : tâche seule. */
    targets: List<CaptureTarget> = emptyList(),
    /** Une note vient d'être créée avec ce titre : l'écran ouvre son éditeur. */
    onNoteCreated: (String) -> Unit = {},
    /** Projet d'où la saisie est ouverte : proposé d'office dès la première tâche. */
    initialProjectUid: String? = null,
    /** Créneau d'où la saisie est ouverte (agenda) : date et heure proposées d'office. */
    initialDate: LocalDate? = null,
    initialTime: LocalTime? = null,
) {
    val viewModel: TasksViewModel = viewModel()
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    val areas by viewModel.areas.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val today = moment.today
    val clock = remember(moment.zone) { Clock.system(moment.zone) }

    var field by rememberSaveable(stateSaver = TextFieldValue.Saver) {
        mutableStateOf(TextFieldValue(initialName, TextRange(initialName.length)))
    }
    val text = field.text
    var target by rememberSaveable { mutableStateOf(targets.firstOrNull() ?: CaptureTarget.TASK) }
    val isTask = target == CaptureTarget.TASK
    var ignored by rememberSaveable { mutableStateOf(emptyList<String>()) }
    var moreOptions by rememberSaveable { mutableStateOf(false) }
    val initialSlot = initialDate?.let { it to initialTime }
    var dateOverride by remember { mutableStateOf(initialSlot) }
    var priorityOverride by remember { mutableStateOf<Int?>(null) }
    var projectOverride by remember { mutableStateOf<String?>(null) }
    // Projet de la série en cours : proposé pour la tâche suivante tant qu'on n'arrête pas d'en ajouter.
    var carriedProject by remember { mutableStateOf(initialProjectUid) }
    var series by remember { mutableStateOf(QuickAddSeries()) }
    var lastCreatedUid by remember { mutableStateOf<String?>(null) }
    var dismissedSuggestionAt by remember { mutableStateOf<Int?>(null) }
    var tagOverrides by remember { mutableStateOf(emptySet<String>()) }
    var pickingDate by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var saving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }
    val genericError = stringResource(R.string.tasks_error_generic)

    val projectRefs = remember(projects) { projects.map { NamedRef(it.uid, it.name) } }
    val tagRefs = remember(tags) { tags.map { NamedRef(it.uid, it.name) } }
    val areaRefs = remember(areas) { areas.map { NamedRef(it.uid, it.name) } }
    val tagColors = remember(tags) { tagBadgeColors(tags) }
    val parsed = remember(text, ignored, projectRefs, tagRefs, areaRefs, clock, isTask) {
        val result = QuickAddParser.parse(text, clock, projectRefs, tagRefs, ignored.toSet(), areaRefs)
        // Une idée ou une note garde le texte tel quel : rien n'y est reconnu.
        if (isTask) result else result.copy(title = text.trim(), tokens = emptyList())
    }
    val date = dateOverride?.first ?: parsed.date
    val time = if (dateOverride != null) dateOverride?.second else parsed.time
    val priority = priorityOverride ?: parsed.priority
    val projectUid = projectOverride ?: parsed.projectUid ?: carriedProject
    val tagUids = (parsed.tagUids + tagOverrides).distinct()

    val allTasks by viewModel.allTasks.collectAsStateWithLifecycle()
    val token: TokenAtCursor? = if (isTask && field.selection.collapsed) {
        QuickAddSuggestions.tokenAt(text, field.selection.start)?.takeIf { it.start != dismissedSuggestionAt }
    } else {
        null
    }
    val suggestions = if (token == null) {
        emptyList()
    } else {
        quickAddSuggestions(token, tags, projects, allTasks, tagColors)
    }

    fun ignore(vararg kinds: TokenKind, uid: String? = null) {
        val keys = parsed.tokens
            .filter { it.kind in kinds && (uid == null || it.refUid == uid) }
            .map { it.key }
        ignored = (ignored + keys).distinct()
    }

    LaunchedEffect(Unit) { focus.requestFocus() }
    // Taper garde la série en vie ; deux minutes de pause la terminent.
    LaunchedEffect(field.text) { series = series.touched(System.currentTimeMillis()) }
    LaunchedEffect(series) {
        if (series.added > 0 || series.projectUid != null) {
            delay(QuickAddSeries.IDLE_MS)
            series = QuickAddSeries()
            carriedProject = null
        }
    }

    fun launchSave(keepOpen: Boolean = false, write: suspend () -> Unit) {
        saving = true
        saveError = null
        scope.launch {
            try {
                write()
                if (keepOpen) saving = false else onDismiss()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                saveError = e.message ?: genericError
                saving = false
            }
        }
    }

    fun save() {
        val title = parsed.title
        if (title.isEmpty() || saving) return
        when (target) {
            CaptureTarget.INBOX -> return launchSave { viewModel.captureIdea(title) }
            // La fiche se retire avant que l'éditeur s'ouvre : il reçoit alors la fenêtre et le clavier.
            CaptureTarget.NOTE -> return launchSave(keepOpen = true) {
                val uid = viewModel.createNote(title)
                sheetState.hide()
                onNoteCreated(uid)
                onDismiss()
            }
            CaptureTarget.TASK -> Unit
        }
        val draft = TaskDraft(
            name = title,
            dueDate = date,
            dueTime = time?.let(::wireTime),
            priority = priority,
            projectUid = projectUid,
            tagUids = tagUids,
            areaUid = parsed.areaUid,
        )
        if (onSave != null) return launchSave { onSave(draft) }
        // La tâche est écrite, la saisie reste ouverte et vide pour la suivante : seul le projet suit.
        launchSave(keepOpen = true) {
            val uid = viewModel.saveNewTask(draft)
            val now = System.currentTimeMillis()
            series = series.saved(projectUid, now)
            lastCreatedUid = uid
            carriedProject = series.carriedProject(now)
            field = TextFieldValue("")
            ignored = emptyList()
            dateOverride = initialSlot
            priorityOverride = null
            projectOverride = null
            tagOverrides = emptySet()
            focus.requestFocus()
        }
    }

    fun undoLast() {
        val uid = lastCreatedUid ?: return
        lastCreatedUid = null
        viewModel.everyTask.value.firstOrNull { it.uid == uid }?.let(viewModel::delete)
        series = series.undone(System.currentTimeMillis())
    }

    val priorityBadgeText = priority?.let { stringResource(priorityBadge(it)) }
    val dateText = date?.let { compactDateTime(it, time, today) }
    val chips = if (!isTask) emptyList() else buildList {
        projects.firstOrNull { it.uid == projectUid }?.let { project ->
            add(ParsedChip(Icons.Outlined.Folder, project.name) {
                projectOverride = null
                carriedProject = null
                series = series.projectRemoved(System.currentTimeMillis())
                ignore(TokenKind.PROJECT)
            })
        }
        dateText?.let {
            add(ParsedChip(Icons.Outlined.Today, it) {
                dateOverride = null
                ignore(TokenKind.DATE, TokenKind.TIME)
            })
        }
        priorityBadgeText?.let {
            add(ParsedChip(Icons.Outlined.Flag, it) {
                priorityOverride = null
                ignore(TokenKind.PRIORITY)
            })
        }
        tagUids.forEach { uid ->
            tags.firstOrNull { it.uid == uid }?.let { tag ->
                add(ParsedChip(Icons.Outlined.Sell, "#" + tag.name, tagColors[uid]) {
                    tagOverrides = tagOverrides - uid
                    ignore(TokenKind.TAG, uid = uid)
                })
            }
        }
    }

    CadenceSheet(
        title = stringResource(
            when (target) {
                CaptureTarget.INBOX -> R.string.tasks_capture_inbox_title
                CaptureTarget.TASK -> R.string.tasks_quick_title
                CaptureTarget.NOTE -> R.string.tasks_note_new
            },
        ),
        subtitle = stringResource(
            when (target) {
                CaptureTarget.INBOX -> R.string.tasks_capture_inbox_subtitle
                CaptureTarget.TASK -> R.string.tasks_capture_subtitle
                CaptureTarget.NOTE -> R.string.tasks_capture_note_subtitle
            },
        ),
        dismiss = { if (!saving) onDismiss() },
        modifier = modifier,
        sheetState = sheetState,
    ) {
        Column(
            Modifier.fillMaxWidth().imePadding(),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            if (targets.size > 1) {
                SegmentedTabs(
                    labels = targets.map { stringResource(it.label) },
                    selected = targets.indexOf(target),
                    onSelect = { target = targets[it] },
                )
            }
            CaptureBox(
                value = field,
                onValueChange = {
                    field = it
                    if (dismissedSuggestionAt != null) dismissedSuggestionAt = null
                },
                parsed = parsed,
                chips = chips,
                enabled = !saving,
                focus = focus,
                onDone = ::save,
                placeholder = stringResource(
                    when (target) {
                        CaptureTarget.INBOX -> R.string.tasks_inbox_capture_hint
                        CaptureTarget.TASK -> R.string.tasks_capture_placeholder
                        CaptureTarget.NOTE -> R.string.tasks_capture_note_placeholder
                    },
                ),
            )
            if (suggestions.isNotEmpty() && token != null) {
                SuggestionStrip(
                    suggestions = suggestions,
                    onPick = { picked ->
                        picked.createTag?.let(viewModel::createTag)
                        val edit = QuickAddSuggestions.insert(text, token, picked.token)
                        field = TextFieldValue(edit.text, TextRange(edit.cursor))
                    },
                    onClose = { dismissedSuggestionAt = token.start },
                )
            }
            if (isTask) {
                DateShortcuts(
                    today = today,
                    date = date,
                    onPick = { picked -> dateOverride = picked to time },
                    onMore = { pickingDate = true },
                )
            }
            AnimatedVisibility(isTask && moreOptions) {
                MoreOptions(
                    priority = priority,
                    onPriority = { picked ->
                        priorityOverride = picked
                        if (picked == null) ignore(TokenKind.PRIORITY)
                    },
                    projects = projects.map { it.uid to it.name },
                    projectIcons = projects.associate { it.uid to it.icon },
                    projectUid = projectUid,
                    onProject = { picked ->
                        projectOverride = picked
                        if (picked == null) {
                            carriedProject = null
                            series = series.projectRemoved(System.currentTimeMillis())
                            ignore(TokenKind.PROJECT)
                        }
                    },
                    tags = tags.map { it.uid to it.name },
                    tagIcons = tags.associate { it.uid to it.icon },
                    tagColors = tagColors,
                    tagUids = tagUids,
                    onTag = { uid ->
                        if (uid in tagUids) {
                            tagOverrides = tagOverrides - uid
                            ignore(TokenKind.TAG, uid = uid)
                        } else {
                            tagOverrides = tagOverrides + uid
                        }
                    },
                )
            }
            saveError?.let { ErrorText(it) }
            if (series.added > 0 && isTask) {
                val projectName = projects.firstOrNull { it.uid == series.projectUid }?.name
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        if (projectName != null) {
                            pluralStringResource(R.plurals.tasks_capture_series_project, series.added, series.added, projectName)
                        } else {
                            pluralStringResource(R.plurals.tasks_capture_series, series.added, series.added)
                        },
                        style = MaterialTheme.typography.labelLarge,
                        color = cadence.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (lastCreatedUid != null) {
                        TertiaryAction(label = stringResource(R.string.tasks_capture_undo_last)) { undoLast() }
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                if (isTask) {
                    TertiaryAction(
                        label = stringResource(if (moreOptions) R.string.tasks_capture_less else R.string.tasks_capture_more),
                    ) { moreOptions = !moreOptions }
                }
                Spacer(Modifier.weight(1f))
                if (series.added > 0 && isTask) {
                    TertiaryAction(label = stringResource(R.string.tasks_capture_done)) { onDismiss() }
                }
                PrimaryAction(
                    label = stringResource(R.string.tasks_add),
                    enabled = parsed.title.isNotEmpty() && !saving,
                ) { save() }
            }
        }
    }

    if (pickingDate) {
        TaskDateSheet(
            title = stringResource(R.string.tasks_field_due),
            today = today,
            date = date,
            time = time,
            onApply = { picked, pickedTime ->
                if (picked == null) {
                    dateOverride = null
                    ignore(TokenKind.DATE, TokenKind.TIME)
                } else {
                    dateOverride = picked to pickedTime
                }
            },
            onDismiss = { pickingDate = false },
        )
    }
}

/** Champ unique : le texte, les mots reconnus en accent, et leurs pastilles juste dessous. */
@Composable
private fun CaptureBox(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    parsed: ParsedQuickAdd,
    chips: List<ParsedChip>,
    enabled: Boolean,
    focus: FocusRequester,
    onDone: () -> Unit,
    placeholder: String,
) {
    val palette = cadence
    var focused by remember { mutableStateOf(false) }
    // Le champ est sur containerHigh, où l'accent clair seul passe sous 4,5:1.
    val tokenColor = readableTintOf(palette.primary, palette.containerHigh)
    val highlight = remember(parsed.tokens, tokenColor) {
        VisualTransformation { source ->
            val styled = buildAnnotatedString {
                append(source)
                parsed.tokens.forEach { token ->
                    if (token.end <= source.length) {
                        val soft = if (token.kind == TokenKind.DATE || token.kind == TokenKind.TIME) tokenColor.copy(alpha = DATE_HIGHLIGHT_ALPHA) else Color.Unspecified
                        addStyle(SpanStyle(color = tokenColor, background = soft), token.start, token.end)
                    }
                }
            }
            TransformedText(styled, OffsetMapping.Identity)
        }
    }
    Column(
        Modifier
            .fillMaxWidth()
            .clip(Radius.Control)
            .background(palette.containerHigh)
            .border(Size.stroke, if (focused) palette.primary else Color.Transparent, Radius.Control)
            .padding(Space.lg),
        verticalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        Box(Modifier.fillMaxWidth().heightIn(min = Size.touch), contentAlignment = Alignment.CenterStart) {
            if (value.text.isEmpty()) {
                Text(
                    placeholder,
                    style = MaterialTheme.typography.bodyLarge,
                    color = palette.outline,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            BasicTextField(
                value = value,
                // Passe à la ligne pour montrer tout le titre ; Entrée valide au lieu d'ajouter une ligne.
                onValueChange = { next ->
                    if ('\n' in next.text && next.text.length == value.text.length + 1) {
                        onDone()
                    } else {
                        onValueChange(next.copy(text = singleLineCapture(next.text)))
                    }
                },
                enabled = enabled,
                singleLine = false,
                maxLines = CAPTURE_MAX_LINES,
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = palette.onSurface),
                cursorBrush = SolidColor(palette.primary),
                visualTransformation = highlight,
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Sentences,
                    imeAction = ImeAction.Done,
                ),
                keyboardActions = KeyboardActions(onDone = { onDone() }),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus)
                    .onFocusChanged { focused = it.isFocused },
            )
        }
        if (chips.isNotEmpty()) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
                verticalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                chips.forEach { ChipView(it) }
            }
        }
    }
}

@Composable
private fun ChipView(chip: ParsedChip) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    val removeLabel = stringResource(R.string.tasks_capture_remove, chip.label)
    Row(
        Modifier
            .heightIn(min = Size.actionSm)
            .clip(Radius.Pill)
            .background(palette.primaryContainer)
            .clickable(role = Role.Button) {
                haptic.tap()
                chip.onRemove()
            }
            .semantics { contentDescription = removeLabel }
            .padding(start = Space.md, end = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(chip.icon, null, tint = chip.tint ?: palette.primary, modifier = Modifier.size(Size.iconSm))
        Spacer(Modifier.width(Space.xs))
        Text(
            chip.label,
            style = MaterialTheme.typography.labelLarge,
            color = palette.onPrimaryContainer,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.width(Space.xs))
        Icon(Icons.Outlined.Close, null, tint = palette.onPrimaryContainer, modifier = Modifier.size(Size.iconSm))
    }
}

/** Raccourcis de date : mêmes libellés, même ordre que la feuille de date. */
@Composable
private fun DateShortcuts(
    today: LocalDate,
    date: LocalDate?,
    onPick: (LocalDate) -> Unit,
    onMore: () -> Unit,
) {
    val tomorrow = QuickDates.tomorrow(today)
    val weekend = QuickDates.weekend(today)
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        ChoiceChip(stringResource(R.string.tasks_day_today), selected = date == today) { onPick(today) }
        ChoiceChip(stringResource(R.string.tasks_day_tomorrow), selected = date == tomorrow) { onPick(tomorrow) }
        ChoiceChip(stringResource(R.string.tasks_date_weekend), selected = date == weekend) { onPick(weekend) }
        val custom = date != null && date != today && date != tomorrow && date != weekend
        ChoiceChip(
            label = stringResource(R.string.tasks_capture_pick_date),
            selected = custom,
            leadingIcon = Icons.Outlined.Today,
            onClick = onMore,
        )
    }
}

@Composable
private fun MoreOptions(
    priority: Int?,
    onPriority: (Int?) -> Unit,
    projects: List<Pair<String, String>>,
    projectIcons: Map<String, String?>,
    projectUid: String?,
    onProject: (String?) -> Unit,
    tags: List<Pair<String, String>>,
    tagIcons: Map<String, String?>,
    tagColors: Map<String, Color>,
    tagUids: List<String>,
    onTag: (String) -> Unit,
) {
    val levels = listOf<Int?>(null, TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH)
    val labels = listOf(
        stringResource(R.string.tasks_priority_none),
        stringResource(R.string.tasks_priority_low),
        stringResource(R.string.tasks_priority_medium),
        stringResource(R.string.tasks_priority_high),
    )
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.md)) {
        FieldGroup(stringResource(R.string.tasks_field_priority)) {
            SegmentedTabs(
                labels = labels,
                selected = levels.indexOf(priority).coerceAtLeast(0),
                onSelect = { onPriority(levels[it]) },
            )
        }
        FieldGroup(stringResource(R.string.tasks_field_project)) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                ChoiceChip(stringResource(R.string.tasks_no_project), selected = projectUid == null) { onProject(null) }
                projects.forEach { (uid, name) ->
                    ChoiceChip(name, selected = projectUid == uid, leadingIcon = entityIcon(projectIcons[uid])) { onProject(uid) }
                }
            }
        }
        if (tags.isNotEmpty()) {
            FieldGroup(stringResource(R.string.tasks_field_tags)) {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                    tags.forEach { (uid, name) ->
                        ChoiceChip("#$name", selected = uid in tagUids, leadingIcon = entityIcon(tagIcons[uid]), dotColor = tagColors[uid]) { onTag(uid) }
                    }
                }
            }
        }
    }
}

private val CaptureTarget.label: Int
    get() = when (this) {
        CaptureTarget.INBOX -> R.string.tasks_capture_target_inbox
        CaptureTarget.TASK -> R.string.tasks_capture_target_task
        CaptureTarget.NOTE -> R.string.tasks_capture_target_note
    }

private const val DATE_HIGHLIGHT_ALPHA = 0.14f
private val HighPriorityDot = Color(0xFFEF4444)
private val MediumPriorityDot = Color(0xFFF59E0B)
private val LowPriorityDot = Color(0xFF3B82F6)

/** Une proposition de la liste : ce qu'elle montre, et le jeton qu'elle met dans le texte. */
private class Suggestion(
    val label: String,
    val token: String,
    val icon: ImageVector? = null,
    val dot: Color? = null,
    /** Nom d'une étiquette à créer avant d'insérer le jeton. */
    val createTag: String? = null,
)

/**
 * Propositions pour le jeton en cours, depuis les données locales : étiquettes (les plus utilisées d'abord,
 * chemin complet), projets ouverts (ni en pause ni clos), priorités `!1`-`!3`.
 */
@Composable
private fun quickAddSuggestions(
    token: TokenAtCursor,
    tags: List<TagItem>,
    projects: List<ProjectItem>,
    tasks: List<ch.nicolab.cadence.tasks.model.TaskItem>,
    tagColors: Map<String, Color>,
): List<Suggestion> = when (token.kind) {
    SuggestionKind.TAG -> {
        val uses = remember(tasks) { tasks.flatMap { it.tagUids }.groupingBy { it }.eachCount() }
        val matches = QuickAddSuggestions.rank(tags, token.query, { it.name }, { uses[it.uid] ?: 0 }).map {
            Suggestion("#" + it.name, QuickAddSuggestions.tagToken(it.name), entityIcon(it.icon), tagColors[it.uid])
        }
        val created = if (matches.isEmpty()) QuickAddSuggestions.newTagName(token.query) else null
        matches + listOfNotNull(created?.let {
            Suggestion(
                stringResource(R.string.tasks_suggest_create_tag, it),
                QuickAddSuggestions.tagToken(it),
                Icons.Outlined.Add,
                createTag = it,
            )
        })
    }
    SuggestionKind.PROJECT -> {
        val uses = remember(tasks) { tasks.mapNotNull { it.projectUid }.groupingBy { it }.eachCount() }
        val open = projects.filter { !it.projectStatus.isClosed && !it.projectStatus.isStash }
        QuickAddSuggestions.rank(open, token.query, { it.name }, { uses[it.uid] ?: 0 }).map {
            Suggestion(it.name, QuickAddSuggestions.projectToken(it.name), entityIcon(it.icon) ?: Icons.Outlined.Folder)
        }
    }
    SuggestionKind.PRIORITY -> listOf(
        Triple(1, R.string.tasks_priority_high, HighPriorityDot),
        Triple(2, R.string.tasks_priority_medium, MediumPriorityDot),
        Triple(3, R.string.tasks_priority_low, LowPriorityDot),
    ).map { (digit, label, dot) ->
        Suggestion(stringResource(R.string.tasks_suggest_priority, digit, stringResource(label)), QuickAddSuggestions.priorityToken(digit), dot = dot)
    }
}

/** Liste compacte juste sous le champ, au-dessus du clavier : un appui insère le jeton. */
@Composable
private fun SuggestionStrip(suggestions: List<Suggestion>, onPick: (Suggestion) -> Unit, onClose: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Row(
            Modifier.weight(1f).horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(Space.sm),
        ) {
            suggestions.forEach { suggestion ->
                ChoiceChip(suggestion.label, selected = false, leadingIcon = suggestion.icon, dotColor = suggestion.dot) {
                    onPick(suggestion)
                }
            }
        }
        val close = stringResource(R.string.tasks_suggest_close)
        Icon(
            Icons.Outlined.Close,
            contentDescription = close,
            tint = cadence.onSurfaceVariant,
            modifier = Modifier
                .padding(start = Space.sm)
                .size(Size.touch)
                .clip(Radius.Pill)
                .clickable(role = Role.Button, onClick = onClose)
                .padding(Space.md),
        )
    }
}

/** Au-delà, le champ défile : le titre reste lisible sans pousser les pastilles hors de la feuille. */
private const val CAPTURE_MAX_LINES = 6
