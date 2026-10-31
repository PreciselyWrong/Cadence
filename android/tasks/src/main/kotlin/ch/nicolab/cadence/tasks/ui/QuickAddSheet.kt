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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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

private class ParsedChip(val icon: ImageVector, val label: String, val onRemove: () -> Unit)

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
) {
    val viewModel: TasksViewModel = viewModel()
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val today = moment.today
    val clock = remember(moment.zone) { Clock.system(moment.zone) }

    var text by rememberSaveable { mutableStateOf(initialName) }
    var ignored by rememberSaveable { mutableStateOf(emptyList<String>()) }
    var moreOptions by rememberSaveable { mutableStateOf(false) }
    var dateOverride by remember { mutableStateOf<Pair<LocalDate, LocalTime?>?>(null) }
    var priorityOverride by remember { mutableStateOf<Int?>(null) }
    var projectOverride by remember { mutableStateOf<String?>(null) }
    var tagOverrides by remember { mutableStateOf(emptySet<String>()) }
    var pickingDate by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    val scope = rememberCoroutineScope()
    var saving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }
    val genericError = stringResource(R.string.tasks_error_generic)

    val projectRefs = remember(projects) { projects.map { NamedRef(it.uid, it.name) } }
    val tagRefs = remember(tags) { tags.map { NamedRef(it.uid, it.name) } }
    val parsed = remember(text, ignored, projectRefs, tagRefs, clock) {
        QuickAddParser.parse(text, clock, projectRefs, tagRefs, ignored.toSet())
    }
    val date = dateOverride?.first ?: parsed.date
    val time = if (dateOverride != null) dateOverride?.second else parsed.time
    val priority = priorityOverride ?: parsed.priority
    val projectUid = projectOverride ?: parsed.projectUid
    val tagUids = (parsed.tagUids + tagOverrides).distinct()

    fun ignore(vararg kinds: TokenKind, uid: String? = null) {
        val keys = parsed.tokens
            .filter { it.kind in kinds && (uid == null || it.refUid == uid) }
            .map { it.key }
        ignored = (ignored + keys).distinct()
    }

    LaunchedEffect(Unit) { focus.requestFocus() }

    fun save() {
        val title = parsed.title
        if (title.isEmpty() || saving) return
        val draft = TaskDraft(
            name = title,
            dueDate = date,
            dueTime = time?.let(::wireTime),
            priority = priority,
            projectUid = projectUid,
            tagUids = tagUids,
        )
        val write: suspend (TaskDraft) -> Unit = onSave ?: viewModel::saveNewTask
        saving = true
        saveError = null
        scope.launch {
            try {
                write(draft)
                onDismiss()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                saveError = e.message ?: genericError
                saving = false
            }
        }
    }

    val priorityBadgeText = priority?.let { stringResource(priorityBadge(it)) }
    val dateText = date?.let { compactDateTime(it, time, today) }
    val chips = buildList {
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
        projects.firstOrNull { it.uid == projectUid }?.let { project ->
            add(ParsedChip(Icons.Outlined.Folder, project.name) {
                projectOverride = null
                ignore(TokenKind.PROJECT)
            })
        }
        tagUids.forEach { uid ->
            tags.firstOrNull { it.uid == uid }?.let { tag ->
                add(ParsedChip(Icons.Outlined.Sell, "#" + tag.name) {
                    tagOverrides = tagOverrides - uid
                    ignore(TokenKind.TAG, uid = uid)
                })
            }
        }
    }

    CadenceSheet(
        title = stringResource(R.string.tasks_quick_title),
        subtitle = stringResource(R.string.tasks_capture_subtitle),
        dismiss = { if (!saving) onDismiss() },
        modifier = modifier,
    ) {
        Column(
            Modifier.fillMaxWidth().imePadding(),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            CaptureBox(
                text = text,
                onTextChange = { text = it },
                parsed = parsed,
                chips = chips,
                enabled = !saving,
                focus = focus,
                onDone = ::save,
            )
            DateShortcuts(
                today = today,
                date = date,
                onPick = { picked -> dateOverride = picked to time },
                onMore = { pickingDate = true },
            )
            AnimatedVisibility(moreOptions) {
                MoreOptions(
                    priority = priority,
                    onPriority = { picked ->
                        priorityOverride = picked
                        if (picked == null) ignore(TokenKind.PRIORITY)
                    },
                    projects = projects.map { it.uid to it.name },
                    projectUid = projectUid,
                    onProject = { picked ->
                        projectOverride = picked
                        if (picked == null) ignore(TokenKind.PROJECT)
                    },
                    tags = tags.map { it.uid to it.name },
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
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                TertiaryAction(
                    label = stringResource(if (moreOptions) R.string.tasks_capture_less else R.string.tasks_capture_more),
                ) { moreOptions = !moreOptions }
                Spacer(Modifier.weight(1f))
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
    text: String,
    onTextChange: (String) -> Unit,
    parsed: ParsedQuickAdd,
    chips: List<ParsedChip>,
    enabled: Boolean,
    focus: FocusRequester,
    onDone: () -> Unit,
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
                    if (token.end <= source.length) addStyle(SpanStyle(color = tokenColor), token.start, token.end)
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
            if (text.isEmpty()) {
                Text(
                    stringResource(R.string.tasks_capture_placeholder),
                    style = MaterialTheme.typography.bodyLarge,
                    color = palette.outline,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            BasicTextField(
                value = text,
                onValueChange = onTextChange,
                enabled = enabled,
                singleLine = true,
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
        Icon(chip.icon, null, tint = palette.primary, modifier = Modifier.size(Size.iconSm))
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
    projectUid: String?,
    onProject: (String?) -> Unit,
    tags: List<Pair<String, String>>,
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
                    ChoiceChip(name, selected = projectUid == uid) { onProject(uid) }
                }
            }
        }
        if (tags.isNotEmpty()) {
            FieldGroup(stringResource(R.string.tasks_field_tags)) {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                    tags.forEach { (uid, name) ->
                        ChoiceChip("#$name", selected = uid in tagUids) { onTag(uid) }
                    }
                }
            }
        }
    }
}
