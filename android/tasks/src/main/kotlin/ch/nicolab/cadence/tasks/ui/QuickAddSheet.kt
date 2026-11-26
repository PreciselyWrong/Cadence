@file:OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import ch.nicolab.cadence.designsystem.components.readableTintOf
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
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
import ch.nicolab.cadence.tasks.quickadd.ShareCapture
import ch.nicolab.cadence.tasks.quickadd.QuickAddSuggestions
import ch.nicolab.cadence.tasks.quickadd.SuggestionKind
import ch.nicolab.cadence.tasks.quickadd.TokenAtCursor
import ch.nicolab.cadence.tasks.quickadd.quickAddDestinationLabel
import ch.nicolab.cadence.tasks.quickadd.quickAddLandsInToPlace
import ch.nicolab.cadence.tasks.quickadd.quickAddNeedsWhen
import ch.nicolab.cadence.tasks.quickadd.singleLineCapture
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ExpandMore
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
import androidx.compose.material3.SheetState
import androidx.compose.material3.SheetValue
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
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
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalWindowInfo
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
import ch.nicolab.cadence.designsystem.components.onColorOf
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.IdeaTasks
import kotlinx.coroutines.flow.flowOf
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
/** Destination d'une saisie. Une adresse seule devient une tâche nommée par le genre de page (`docs/37-links.md`). */
enum class CaptureTarget { INBOX, TASK, NOTE }

internal class ParsedChip(val icon: ImageVector, val label: String, val tint: Color? = null, val onRemove: () -> Unit)

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
    /** Note de la tâche (une idée de l'Inbox : son adresse et le reste du texte) ; non montrée dans la saisie. */
    initialNote: String? = null,
    /** Étiquettes proposées d'office (un lien qui devient une tâche). */
    initialTagUids: List<String> = emptyList(),
    /** Ouvre la saisie avec le projet et les étiquettes visibles : trier une idée, c'est d'abord les choisir. */
    expanded: Boolean = false,
    /**
     * Faux dans l'app : la feuille apparaît déjà en place et ne monte qu'une fois, avec le clavier. Vrai pour l'ajout
     * rapide des widgets, au-dessus d'une activité vide.
     */
    slideIn: Boolean = false,
    /** Vrai pour l'ajout rapide des widgets : la feuille se ferme une fois la tâche écrite, sans série. */
    closeAfterSave: Boolean = false,
    /** Dans l'app : « Voir » après une tâche sans date ouvre Planifier › À placer (la feuille se ferme avant). */
    onShowToPlace: (() -> Unit)? = null,
) {
    val viewModel: TasksViewModel = viewModel()
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    val areas by viewModel.areas.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val today = moment.today
    val clock = remember(moment.zone) { Clock.system(moment.zone) }
    val context = androidx.compose.ui.platform.LocalContext.current

    var field by rememberSaveable(stateSaver = TextFieldValue.Saver) {
        mutableStateOf(TextFieldValue(initialName, TextRange(initialName.length)))
    }
    val text = field.text
    var target by rememberSaveable { mutableStateOf(targets.firstOrNull() ?: CaptureTarget.TASK) }
    // Un lien seul (web : `linkOnlyAddress`) propose Inbox, Tâche et Note, Inbox d'office ; un mot de plus les retire.
    val linkOnly = remember(field.text) { IdeaTasks.linkOnly(field.text) }
    val shownTargets = if (linkOnly != null && CaptureTarget.INBOX in targets) {
        listOf(CaptureTarget.INBOX, CaptureTarget.TASK, CaptureTarget.NOTE).filter { it in targets }
    } else {
        targets
    }
    var targetChosen by rememberSaveable { mutableStateOf(false) }
    // Titre de la page du lien seul, lu par le serveur (jamais l'appareil vers le site) : nom de la tâche ou du lien.
    val pageTitle by remember(linkOnly) { linkOnly?.let { viewModel.linkPreviews.observe(it) } ?: flowOf(null) }
        .collectAsStateWithLifecycle(null)
    LaunchedEffect(linkOnly) { linkOnly?.let { viewModel.linkPreviews.ensure(it) } }
    LaunchedEffect(linkOnly != null) {
        if (linkOnly != null && !targetChosen && CaptureTarget.INBOX in targets) target = CaptureTarget.INBOX
    }
    val isTask = target == CaptureTarget.TASK
    val readsTokens = isTask
    var ignored by rememberSaveable { mutableStateOf(emptyList<String>()) }
    var moreOptions by rememberSaveable { mutableStateOf(expanded) }
    val initialSlot = initialDate?.let { it to initialTime }
    var dateOverride by remember { mutableStateOf(initialSlot) }
    var priorityOverride by remember { mutableStateOf<Int?>(null) }
    var projectOverride by remember { mutableStateOf<String?>(null) }
    // Projet de la série en cours : proposé pour la tâche suivante tant qu'on n'arrête pas d'en ajouter.
    var carriedProject by remember { mutableStateOf(initialProjectUid) }
    var series by remember { mutableStateOf(QuickAddSeries()) }
    var lastCreatedUid by remember { mutableStateOf<String?>(null) }
    var lastInToPlace by remember { mutableStateOf(false) }
    var dismissedSuggestionAt by remember { mutableStateOf<Int?>(null) }
    var tagOverrides by remember { mutableStateOf(initialTagUids.toSet()) }
    var pickingDate by remember { mutableStateOf(false) }
    var openMenu by remember { mutableStateOf<QuickMenu?>(null) }
    val focus = remember { FocusRequester() }
    val sheetState = if (slideIn) rememberModalBottomSheetState(skipPartiallyExpanded = true) else appearingSheetState()
    val scope = rememberCoroutineScope()
    var saving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }
    val genericError = stringResource(R.string.tasks_error_generic)

    val projectRefs = remember(projects) { projects.map { NamedRef(it.uid, it.name) } }
    val tagRefs = remember(tags) { tags.map { NamedRef(it.uid, it.name) } }
    val areaRefs = remember(areas) { areas.map { NamedRef(it.uid, it.name) } }
    val tagColors = remember(tags) { tagBadgeColors(tags) }
    val parsed = remember(text, ignored, projectRefs, tagRefs, areaRefs, clock, readsTokens) {
        val result = QuickAddParser.parse(text, clock, projectRefs, tagRefs, ignored.toSet(), areaRefs)
        // Une idée ou une note garde le texte tel quel : rien n'y est reconnu (un lien garde ses étiquettes et son projet).
        if (readsTokens) result else result.copy(title = text.trim(), tokens = emptyList())
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
            CaptureTarget.INBOX -> return launchSave {
                viewModel.captureIdea(title)
                if (closeAfterSave) {
                    android.widget.Toast.makeText(
                        context,
                        quickAddDestinationLabel(isInbox = true, projectName = null, hasDate = false),
                        android.widget.Toast.LENGTH_SHORT,
                    ).show()
                }
            }
            // La fiche se retire avant que l'éditeur s'ouvre : il reçoit alors la fenêtre et le clavier.
            CaptureTarget.NOTE -> return launchSave(keepOpen = true) {
                val uid = viewModel.createNote(title)
                sheetState.hide()
                onNoteCreated(uid)
                onDismiss()
            }
            CaptureTarget.TASK -> Unit
        }
        // Un lien seul devient une tâche nommée par le genre de page (« Essayer : … »), l'adresse en note et en
        // origine ; sans date, une tâche avec projet/domaine garde `needsWhen = true` pour rester visible dans « À classer ».
        val fromLink = linkOnly?.takeIf { initialNote == null }
        val draft = TaskDraft(
            name = fromLink?.let { IdeaTasks.taskName(it, pageTitle?.title, ShareCapture.verbs(context)) } ?: title,
            needsWhen = quickAddNeedsWhen(date, projectUid, parsed.areaUid, fromLink != null),
            note = fromLink ?: initialNote,
            source = fromLink?.let { "link" },
            sourceUrl = fromLink,
            dueDate = date,
            dueTime = time?.let(::wireTime),
            priority = priority,
            projectUid = projectUid,
            tagUids = tagUids,
            areaUid = parsed.areaUid,
        )
        if (onSave != null) return launchSave { onSave(draft) }
        if (closeAfterSave) return launchSave {
            viewModel.saveNewTask(draft)
            val projectName = projects.firstOrNull { it.uid == projectUid }?.name
            android.widget.Toast.makeText(
                context,
                quickAddDestinationLabel(isInbox = false, projectName = projectName, hasDate = date != null),
                android.widget.Toast.LENGTH_SHORT,
            ).show()
        }
        // La tâche est écrite, la saisie reste ouverte et vide pour la suivante : seul le projet suit.
        launchSave(keepOpen = true) {
            val uid = viewModel.saveNewTask(draft)
            val now = System.currentTimeMillis()
            series = series.saved(projectUid, now)
            lastCreatedUid = uid
            lastInToPlace = quickAddLandsInToPlace(isInbox = false, hasDate = date != null)
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
    val chips = if (!readsTokens) emptyList() else buildList {
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

    // Légère par défaut : ni titre ni aide, le champ et une rangée d'icônes. « Plus d'options » ramène l'en-tête.
    val full = isTask && moreOptions
    CadenceSheet(
        title = if (full) stringResource(R.string.tasks_quick_title) else null,
        subtitle = if (full) stringResource(R.string.tasks_capture_subtitle) else null,
        dismiss = { if (!saving) onDismiss() },
        modifier = modifier,
        sheetState = sheetState,
    ) {
        // La feuille a sa propre fenêtre : un focus demandé avant qu'elle l'ait n'ouvre pas le clavier
        // (ajout rapide des widgets, au-dessus d'une activité vide).
        val window = LocalWindowInfo.current
        val keyboard = LocalSoftwareKeyboardController.current
        var keyboardOpened by remember { mutableStateOf(false) }
        // Le clavier reste levé tant que la feuille est ouverte : après chaque geste dans la feuille, le champ reprend le focus.
        val keepKeyboard = {
            runCatching { focus.requestFocus() }
            keyboard?.show()
        }
        // Le sélecteur de date a sa propre fenêtre : le clavier revient à sa fermeture.
        LaunchedEffect(pickingDate, window.isWindowFocused) {
            if (!pickingDate && window.isWindowFocused && keyboardOpened) keepKeyboard()
        }
        LaunchedEffect(window.isWindowFocused) {
            if (window.isWindowFocused && !keyboardOpened) {
                keyboardOpened = true
                focus.requestFocus()
                keyboard?.show()
            }
        }
        Column(
            Modifier
                .fillMaxWidth()
                .animateContentSize()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .pointerInput(Unit) {
                    awaitPointerEventScope {
                        while (true) {
                            val event = awaitPointerEvent(PointerEventPass.Final)
                            if (event.changes.none { it.pressed }) keepKeyboard()
                        }
                    }
                },
            verticalArrangement = Arrangement.spacedBy(Space.sm),
        ) {
            if (shownTargets.size > 1) {
                if (full) {
                    SegmentedTabs(
                        labels = shownTargets.map { stringResource(it.label) },
                        selected = shownTargets.indexOf(target),
                        onSelect = {
                            target = shownTargets[it]
                            targetChosen = true
                        },
                    )
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                        shownTargets.forEach { shown ->
                            ChoiceChip(stringResource(shown.label), selected = shown == target) {
                                target = shown
                                targetChosen = true
                            }
                        }
                    }
                }
            }
            CaptureBox(
                value = field,
                onValueChange = {
                    field = it
                    if (dismissedSuggestionAt != null) dismissedSuggestionAt = null
                },
                parsed = parsed,
                chips = chips,
                saving = saving,
                focus = focus,
                onDone = ::save,
                onEscape = {
                    val open = suggestions.isNotEmpty() && token != null
                    if (token != null && open) dismissedSuggestionAt = token.start
                    open
                },
                placeholder = stringResource(
                    when (target) {
                        CaptureTarget.INBOX -> R.string.tasks_inbox_capture_hint
                        CaptureTarget.TASK -> R.string.tasks_capture_placeholder
                        CaptureTarget.NOTE -> R.string.tasks_capture_note_placeholder
                    },
                ),
            )
            if (suggestions.isNotEmpty() && token != null) {
                SuggestionList(
                    suggestions = suggestions,
                    onPick = { picked ->
                        picked.createTag?.let(viewModel::createTag)
                        val edit = QuickAddSuggestions.insert(text, token, picked.token)
                        field = TextFieldValue(edit.text, TextRange(edit.cursor))
                    },
                )
            }
            if (full) {
                DateShortcuts(
                    today = today,
                    date = date,
                    onPick = { picked -> dateOverride = picked to time },
                    onMore = { pickingDate = true },
                )
                MoreOptions(
                    priority = priority,
                    onPriority = { picked ->
                        priorityOverride = picked
                        if (picked == null) ignore(TokenKind.PRIORITY)
                    },
                    projects = projects,
                    projectUid = projectUid,
                    onProject = { picked ->
                        projectOverride = picked
                        if (picked == null) {
                            carriedProject = null
                            series = series.projectRemoved(System.currentTimeMillis())
                            ignore(TokenKind.PROJECT)
                        }
                    },
                    tags = tags,
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
                        if (lastInToPlace && onShowToPlace != null) {
                            TertiaryAction(label = stringResource(R.string.tasks_capture_see_to_place)) {
                                onDismiss()
                                onShowToPlace()
                            }
                        }
                        TertiaryAction(label = stringResource(R.string.tasks_capture_undo_last)) { undoLast() }
                    }
                    TertiaryAction(label = stringResource(R.string.tasks_capture_done)) { onDismiss() }
                }
            }
            val canAdd = parsed.title.isNotEmpty() && !saving
            if (full) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    TertiaryAction(label = stringResource(R.string.tasks_capture_less)) { moreOptions = false }
                    Spacer(Modifier.weight(1f))
                    PrimaryAction(label = stringResource(R.string.tasks_add), enabled = canAdd) { save() }
                }
            } else {
                QuickAddMenus(
                    isTask = isTask,
                    trailing = { CompactAddButton(label = stringResource(R.string.tasks_add), enabled = canAdd) { save() } },
                        menu = openMenu,
                        onMenu = { openMenu = it },
                        today = today,
                        date = date,
                        onDate = { picked -> dateOverride = picked to time },
                        onClearDate = {
                            dateOverride = null
                            ignore(TokenKind.DATE, TokenKind.TIME)
                        },
                        onPickDate = { pickingDate = true },
                        priority = priority,
                        onPriority = { picked ->
                            priorityOverride = picked
                            if (picked == null) ignore(TokenKind.PRIORITY)
                        },
                        projects = projects,
                        projectUid = projectUid,
                        onProject = { picked ->
                            projectOverride = picked
                            if (picked == null) {
                                carriedProject = null
                                series = series.projectRemoved(System.currentTimeMillis())
                                ignore(TokenKind.PROJECT)
                            }
                        },
                        tags = tags,
                        tagUids = tagUids,
                        tagColors = tagColors,
                        onTag = { uid ->
                            if (uid in tagUids) {
                                tagOverrides = tagOverrides - uid
                                ignore(TokenKind.TAG, uid = uid)
                            } else {
                                tagOverrides = tagOverrides + uid
                            }
                        },
                    onExpand = { moreOptions = true },
                )
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
internal fun CaptureBox(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    parsed: ParsedQuickAdd,
    chips: List<ParsedChip>,
    /** Pendant l'écriture : lecture seule, pas désactivé (un champ désactivé perd le focus et Android ferme le clavier). */
    saving: Boolean,
    focus: FocusRequester,
    onDone: () -> Unit,
    /** Échap : vrai si une liste de suggestions s'est fermée (la touche est alors consommée). */
    onEscape: () -> Boolean,
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
            .padding(horizontal = Space.lg, vertical = Space.sm),
        verticalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        Box(Modifier.fillMaxWidth().heightIn(min = Size.tab), contentAlignment = Alignment.CenterStart) {
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
                readOnly = saving,
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
                    .onFocusChanged { focused = it.isFocused }
                    .onPreviewKeyEvent { it.key == Key.Escape && it.type == KeyEventType.KeyUp && onEscape() },
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
internal fun DateShortcuts(
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
    projects: List<ProjectItem>,
    projectUid: String?,
    onProject: (String?) -> Unit,
    tags: List<TagItem>,
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
        ProjectAndTagFields(projects, projectUid, onProject, tags, tagUids, onTag)
    }
}

/**
 * Projet (« Aucun projet » d'abord) et étiquettes en pastilles qui défilent : le même choix dans la saisie rapide,
 * la feuille de partage et l'enregistrement d'un lien.
 */
@Composable
internal fun ProjectAndTagFields(
    projects: List<ProjectItem>,
    projectUid: String?,
    onProject: (String?) -> Unit,
    tags: List<TagItem>,
    tagUids: List<String>,
    onTag: (String) -> Unit,
) {
    val tagColors = remember(tags) { tagBadgeColors(tags) }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.md)) {
        FieldGroup(stringResource(R.string.tasks_field_project)) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                ChoiceChip(stringResource(R.string.tasks_no_project), selected = projectUid == null) { onProject(null) }
                projects.forEach { project ->
                    ChoiceChip(project.name, selected = projectUid == project.uid, leadingIcon = entityIcon(project.icon)) { onProject(project.uid) }
                }
            }
        }
        if (tags.isNotEmpty()) {
            FieldGroup(stringResource(R.string.tasks_field_tags)) {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                    tags.forEach { tag ->
                        ChoiceChip(
                            "#${tag.name}",
                            selected = tag.uid in tagUids,
                            leadingIcon = entityIcon(tag.icon),
                            dotColor = tagColors[tag.uid],
                        ) { onTag(tag.uid) }
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

/**
 * Liste verticale juste sous le champ, comme les corrections d'un traitement de texte : la meilleure
 * proposition d'abord, [QuickAddSuggestions.VISIBLE_ROWS] lignes visibles, le reste défile. Un appui insère le jeton.
 */
@Composable
private fun SuggestionList(suggestions: List<Suggestion>, onPick: (Suggestion) -> Unit) {
    val palette = cadence
    Column(
        Modifier
            .fillMaxWidth()
            .clip(Radius.Control)
            .background(palette.containerHigh)
            .heightIn(max = Size.touch * QuickAddSuggestions.visibleRows(suggestions.size))
            .verticalScroll(rememberScrollState()),
    ) {
        suggestions.forEach { suggestion ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = Size.touch)
                    .clickable(role = Role.Button) { onPick(suggestion) }
                    .padding(horizontal = Space.lg),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Space.md),
            ) {
                Box(Modifier.size(Size.icon), contentAlignment = Alignment.Center) {
                    when {
                        suggestion.icon != null ->
                            Icon(suggestion.icon, null, tint = suggestion.dot ?: palette.onSurfaceVariant, modifier = Modifier.size(Size.icon))
                        suggestion.dot != null ->
                            Box(Modifier.size(Size.iconSm - Space.xs).background(suggestion.dot, CircleShape))
                    }
                }
                Text(
                    suggestion.label,
                    style = MaterialTheme.typography.bodyLarge,
                    color = palette.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** Les quatre choix de la rangée d'icônes : un seul menu ouvert à la fois. */
private enum class QuickMenu { DATE, PROJECT, TAG, PRIORITY }

/**
 * Sous le champ : le choix de l'icône touchée en liste (comme les suggestions, dans la feuille : une fenêtre de menu
 * volerait le focus et fermerait le clavier), puis la rangée d'icônes et [trailing]. La dernière icône ouvre toute la saisie.
 */
@Composable
private fun QuickAddMenus(
    isTask: Boolean,
    trailing: @Composable () -> Unit,
    menu: QuickMenu?,
    onMenu: (QuickMenu?) -> Unit,
    today: LocalDate,
    date: LocalDate?,
    onDate: (LocalDate) -> Unit,
    onClearDate: () -> Unit,
    onPickDate: () -> Unit,
    priority: Int?,
    onPriority: (Int?) -> Unit,
    projects: List<ProjectItem>,
    projectUid: String?,
    onProject: (String?) -> Unit,
    tags: List<TagItem>,
    tagUids: List<String>,
    tagColors: Map<String, Color>,
    onTag: (String) -> Unit,
    onExpand: () -> Unit,
) {
    val palette = cadence
    val close = { onMenu(null) }
    val tomorrow = QuickDates.tomorrow(today)
    val weekend = QuickDates.weekend(today)
    val levels = listOf<Int?>(null, TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH)
    val levelLabels = listOf(
        stringResource(R.string.tasks_priority_none),
        stringResource(R.string.tasks_priority_low),
        stringResource(R.string.tasks_priority_medium),
        stringResource(R.string.tasks_priority_high),
    )
    fun toggle(target: QuickMenu) = onMenu(if (menu == target) null else target)
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        if (isTask && menu != null) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(Radius.Control)
                    .background(palette.containerHigh)
                    .heightIn(max = Size.touch * QuickAddSuggestions.visibleRows(Int.MAX_VALUE))
                    .verticalScroll(rememberScrollState()),
            ) {
                when (menu) {
                    QuickMenu.DATE -> {
                        listOf(
                            stringResource(R.string.tasks_day_today) to today,
                            stringResource(R.string.tasks_day_tomorrow) to tomorrow,
                            stringResource(R.string.tasks_date_weekend) to weekend,
                        ).forEach { (label, day) ->
                            MenuRow(label, selected = date == day) {
                                onDate(day)
                                close()
                            }
                        }
                        MenuRow(stringResource(R.string.tasks_capture_pick_date), selected = date != null && date !in listOf(today, tomorrow, weekend)) {
                            close()
                            onPickDate()
                        }
                        if (date != null) {
                            MenuRow(stringResource(R.string.tasks_no_due_date), selected = false) {
                                onClearDate()
                                close()
                            }
                        }
                    }
                    QuickMenu.PROJECT -> {
                        MenuRow(stringResource(R.string.tasks_no_project), selected = projectUid == null) {
                            onProject(null)
                            close()
                        }
                        projects.forEach { project ->
                            MenuRow(project.name, selected = projectUid == project.uid, icon = entityIcon(project.icon)) {
                                onProject(project.uid)
                                close()
                            }
                        }
                    }
                    QuickMenu.TAG -> tags.forEach { tag ->
                        MenuRow("#" + tag.name, selected = tag.uid in tagUids, icon = entityIcon(tag.icon), tint = tagColors[tag.uid]) { onTag(tag.uid) }
                    }
                    QuickMenu.PRIORITY -> levels.forEachIndexed { index, level ->
                        MenuRow(levelLabels[index], selected = priority == level) {
                            onPriority(level)
                            close()
                        }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            if (isTask) {
                IconButton(Icons.Outlined.Today, stringResource(R.string.tasks_field_due), if (date != null || menu == QuickMenu.DATE) palette.primary else palette.onSurfaceVariant) { toggle(QuickMenu.DATE) }
                IconButton(Icons.Outlined.Folder, stringResource(R.string.tasks_field_project), if (projectUid != null || menu == QuickMenu.PROJECT) palette.primary else palette.onSurfaceVariant) { toggle(QuickMenu.PROJECT) }
                if (tags.isNotEmpty()) {
                    IconButton(Icons.Outlined.Sell, stringResource(R.string.tasks_field_tags), if (tagUids.isNotEmpty() || menu == QuickMenu.TAG) palette.primary else palette.onSurfaceVariant) { toggle(QuickMenu.TAG) }
                }
                IconButton(Icons.Outlined.Flag, stringResource(R.string.tasks_field_priority), if (priority != null || menu == QuickMenu.PRIORITY) palette.primary else palette.onSurfaceVariant) { toggle(QuickMenu.PRIORITY) }
                IconButton(Icons.Outlined.ExpandMore, stringResource(R.string.tasks_capture_more), palette.onSurfaceVariant, onClick = onExpand)
            }
            Spacer(Modifier.weight(1f))
            trailing()
        }
    }
}

@Composable
private fun MenuRow(label: String, selected: Boolean, icon: ImageVector? = null, tint: Color? = null, onClick: () -> Unit) {
    val palette = cadence
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = Size.touch)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = Space.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Space.md),
    ) {
        Box(Modifier.size(Size.icon), contentAlignment = Alignment.Center) {
            if (icon != null) Icon(icon, null, tint = tint ?: palette.onSurfaceVariant, modifier = Modifier.size(Size.icon))
        }
        Text(label, style = MaterialTheme.typography.bodyLarge, color = palette.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (selected) Icon(Icons.Outlined.Check, null, tint = palette.primary, modifier = Modifier.size(Size.icon))
    }
}

/** Icône nue sur une cible de 48 dp, au toucher décrit par [description]. */
@Composable
private fun IconButton(icon: ImageVector, description: String, tint: Color, onClick: () -> Unit) {
    Box(
        Modifier
            .size(Size.touch)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClickLabel = description, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(Size.iconLarge))
    }
}

/** « Ajouter » en pastille basse : l'action principale de la rangée légère, sur une cible de 48 dp. */
@Composable
private fun CompactAddButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    val fill = if (enabled) palette.primary else palette.containerHigh
    Box(
        Modifier
            .heightIn(min = Size.touch)
            .clickable(enabled = enabled, role = Role.Button) {
                haptic.confirm()
                onClick()
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .heightIn(min = Size.tab)
                .clip(Radius.Pill)
                .background(fill)
                .padding(horizontal = Space.lg),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                label,
                style = MaterialTheme.typography.labelLarge,
                color = if (enabled) onColorOf(fill) else palette.onSurfaceVariant,
                maxLines = 1,
            )
        }
    }
}

/** Au-delà, le champ défile : le titre reste lisible sans pousser les pastilles hors de la feuille. */
private const val CAPTURE_MAX_LINES = 6

/** Feuille ouverte d'emblée, sans glissement d'entrée ; seuils de [rememberModalBottomSheetState]. */
@Composable
private fun appearingSheetState(): SheetState {
    val density = LocalDensity.current
    return remember(density) {
        SheetState(
            skipPartiallyExpanded = true,
            positionalThreshold = { with(density) { 56.dp.toPx() } },
            velocityThreshold = { with(density) { 125.dp.toPx() } },
            initialValue = SheetValue.Expanded,
        )
    }
}
