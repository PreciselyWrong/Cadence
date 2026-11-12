package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.FormatIndentDecrease
import androidx.compose.material.icons.automirrored.outlined.FormatIndentIncrease
import androidx.compose.material.icons.automirrored.outlined.FormatListBulleted
import androidx.compose.material.icons.outlined.AddTask
import androidx.compose.material.icons.outlined.AlternateEmail
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.CheckBox
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.DataArray
import androidx.compose.material.icons.outlined.FormatBold
import androidx.compose.material.icons.outlined.FormatItalic
import androidx.compose.material.icons.outlined.FormatListNumbered
import androidx.compose.material.icons.outlined.FormatQuote
import androidx.compose.material.icons.outlined.FormatStrikethrough
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.TableChart
import androidx.compose.material.icons.outlined.Title
import androidx.compose.material.icons.outlined.UnfoldLess
import androidx.compose.material.icons.outlined.UnfoldMore
import androidx.compose.material.icons.outlined.ZoomIn
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.graphics.Color
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.contentlinks.MentionPerson
import ch.nicolab.cadence.tasks.contentlinks.PeopleClient
import ch.nicolab.cadence.tasks.notes.FoldMapping
import ch.nicolab.cadence.tasks.notes.LineKind
import ch.nicolab.cadence.tasks.notes.MarkdownFormat
import ch.nicolab.cadence.tasks.notes.NoteOutline
import ch.nicolab.cadence.tasks.notes.OutlineFoldStore
import ch.nicolab.cadence.tasks.notes.OutlineInput
import ch.nicolab.cadence.tasks.notes.OutlineOptions
import ch.nicolab.cadence.tasks.notes.TextChange
import ch.nicolab.cadence.tasks.notes.TextEdit

/**
 * L'éditeur en plan d'une note ou d'une description (`docs/45-outliner.md`) : un seul champ de texte Markdown, les
 * règles du plan appliquées aux saisies ([OutlineInput]) et aux boutons de la barre ; replis gardés par appareil
 * ([OutlineFoldStore], clé [foldScope]) ; zoom sur une puce le temps de la visite (le champ montre alors son
 * sous-arbre, remis en place à chaque saisie). Le texte complet est rendu par [onChange].
 */
@Stable
internal class OutlineEditorState(
    initial: String,
    private val foldScope: String?,
    private val store: OutlineFoldStore,
    private val onChange: (String) -> Unit,
) {
    /** Le texte complet. */
    var doc by mutableStateOf(initial)
        private set

    /** Ce que montre le champ : le texte complet, ou le sous-arbre zoomé. */
    var fieldValue by mutableStateOf(TextFieldValue(initial, TextRange(initial.length)))
        private set

    /** Première ligne (dans [doc]) de la puce zoomée. */
    var zoom by mutableStateOf<Int?>(null)
        private set

    /** Premières lignes (dans [doc]) des puces repliées. */
    private var folds by mutableStateOf(loadFolds(initial))

    private val offset get() = zoom ?: 0

    private fun loadFolds(text: String) = foldScope?.let { OutlineInput.linesOfKeys(text, store.load(it)) }.orEmpty()

    /** Relit les replis gardés : la lecture a pu en changer pendant que l'éditeur était fermé. */
    fun reloadFolds() {
        folds = loadFolds(doc)
    }

    /** Replis dans les lignes du champ. */
    val fieldFolds: Set<Int> get() = folds.mapNotNull { (it - offset).takeIf { line -> line >= 0 } }.toSet()

    private val options get() = OutlineOptions(rootLine = if (zoom != null) 0 else null, folded = { it + offset in folds })

    private fun saveFolds() {
        foldScope?.let { store.save(it, OutlineInput.keysOfLines(doc, folds)) }
    }

    /** Une saisie du clavier. */
    fun onFieldChange(next: TextFieldValue) {
        val before = fieldValue
        if (next.text == before.text) {
            fieldValue = next
            revealCaret()
            return
        }
        val interpreted = OutlineInput.interpret(before.toEdit(), next.toEdit(), options)
        commit(interpreted?.toValue() ?: next, structural = interpreted != null, caret = minOf(before.selection.min, next.selection.min))
    }

    /** Remplace le texte complet venu d'ailleurs (écho de la base, case cochée en lecture), sans le renvoyer. */
    fun replaceDoc(text: String) {
        if (text == doc) return
        folds = OutlineInput.mapFoldedLines(doc, text, folds)
        doc = text
        val sub = zoom?.let { NoteOutline.subtreeText(text, it) }
        if (sub == null) zoom = null
        showField(sub ?: text, fieldValue.selection)
    }

    /** Remplace le texte complet et le renvoie (case cochée en lecture). */
    fun edit(text: String) {
        if (text == doc) return
        replaceDoc(text)
        onChange(text)
    }

    /** Place le curseur à la fin du texte, avant l'édition au toucher d'une note en lecture. */
    fun caretToEnd() {
        fieldValue = fieldValue.copy(selection = TextRange(fieldValue.text.length))
    }

    private fun showField(text: String, selection: TextRange) {
        fieldValue = TextFieldValue(text, TextRange(selection.start.coerceIn(0, text.length), selection.end.coerceIn(0, text.length)))
    }

    private fun commit(value: TextFieldValue, structural: Boolean, caret: Int = Int.MAX_VALUE) {
        val oldDoc = doc
        val z = zoom
        val newDoc = if (z != null) NoteOutline.replaceSubtree(oldDoc, z, value.text) else value.text
        folds = if (structural || z != null) {
            OutlineInput.linesOfKeys(newDoc, OutlineInput.keysOfLines(oldDoc, folds))
        } else {
            OutlineInput.mapFoldedLines(oldDoc, newDoc, folds, caret)
        }
        doc = newDoc
        fieldValue = value
        if (z != null) {
            // Ce qui ne fait plus partie de la puce zoomée sort de la vue (et reste dans le texte) ; une puce
            // zoomée qui n'en est plus une ramène au texte complet.
            val sub = NoteOutline.subtreeText(newDoc, z)
            if (sub == null) {
                zoom = null
                showField(newDoc, TextRange(OutlineInput.endOfLine(newDoc, z)))
            } else if (sub != value.text) {
                showField(sub, value.selection)
            }
        }
        revealCaret()
        saveFolds()
        onChange(newDoc)
    }

    /** Un curseur arrivé dans une partie repliée la déplie. */
    private fun revealCaret() {
        val hiding = OutlineInput.foldHiding(fieldValue.text, fieldFolds, fieldValue.selection.start) ?: return
        folds = folds - (hiding + offset)
        saveFolds()
    }

    /** Une édition du plan (retrait, déplacement, case…) : les puces repliées le restent. */
    fun command(command: (TextEdit, OutlineOptions) -> TextChange?) {
        val sel = fieldValue.toEdit()
        val edit = command(sel, options) ?: return
        if (NoteOutline.isNoop(edit, sel)) return
        commit(edit.result(sel.text).toValue(), structural = true)
    }

    /** Une commande de mise en forme. */
    fun format(command: (TextEdit) -> TextChange) {
        val sel = fieldValue.toEdit()
        commit(command(sel).result(sel.text).toValue(), structural = false, caret = sel.selStart)
    }

    /** La puce du curseur est sur la racine du zoom : retrait et déplacement n'y font rien (comme le web). */
    val onRoot: Boolean get() = zoom != null && OutlineInput.caretItemLine(fieldValue.toEdit()) == 0

    /** La puce du curseur peut se replier, et l'est déjà ou non (null : rien à replier). */
    val caretFolded: Boolean?
        get() {
            val line = OutlineInput.caretItemLine(fieldValue.toEdit()) ?: return null
            if (zoom != null && line == 0) return null
            if (NoteOutline.foldRange(fieldValue.text, line) == null) return null
            return line + offset in folds
        }

    fun toggleFold() {
        val sel = fieldValue.toEdit()
        val line = OutlineInput.caretItemLine(sel) ?: return
        if (caretFolded == null) return
        val full = line + offset
        if (full in folds) {
            folds = folds - full
        } else {
            folds = folds + full
            val end = OutlineInput.endOfLine(sel.text, line)
            if (sel.selStart > end) fieldValue = fieldValue.copy(selection = TextRange(end))
        }
        saveFolds()
    }

    fun zoomIn() {
        val line = OutlineInput.caretItemLine(fieldValue.toEdit()) ?: return
        zoomTo(line + offset)
    }

    /** Zoom sur la puce de la ligne [line] du texte complet, ou retour au texte complet (null). */
    fun zoomTo(line: Int?) {
        val previous = zoom
        if (line == null) {
            zoom = null
            showField(doc, TextRange(previous?.let { OutlineInput.endOfLine(doc, it) } ?: fieldValue.selection.start))
            return
        }
        val sub = NoteOutline.subtreeText(doc, line) ?: return
        if (line in folds) {
            folds = folds - line
            saveFolds()
        }
        zoom = line
        showField(sub, TextRange(sub.substringBefore('\n').length))
    }

    /** Fil d'Ariane du zoom : les puces au-dessus de la puce zoomée, de haut en bas (ligne, texte). */
    val crumbs: List<Pair<Int, String>>
        get() {
            val z = zoom ?: return emptyList()
            val outline = NoteOutline.parse(doc)
            return NoteOutline.ancestorLines(outline, z).dropLast(1).map { line ->
                line to outline.items[NoteOutline.itemAtLine(outline, line)].text
            }
        }

    /** La puce du curseur devient une tâche liée : le texte est remplacé tout de suite, le nom revient à l'appelant. */
    fun makeTask(): String? {
        val sel = fieldValue.toEdit()
        val made = NoteOutline.taskFromItem(sel) ?: return null
        commit(made.edit.result(sel.text).toValue(), structural = true)
        return made.name
    }

    val trigger: OutlineInput.Trigger? get() = OutlineInput.trigger(fieldValue.toEdit())

    fun complete(trigger: OutlineInput.Trigger, token: String) {
        val sel = fieldValue.toEdit()
        commit(OutlineInput.complete(sel, trigger, token).toValue(), structural = false, caret = trigger.start)
    }
}

internal fun TextFieldValue.toEdit() = TextEdit(text, selection.min, selection.max)

internal fun TextEdit.toValue() = TextFieldValue(text, TextRange(selStart, selEnd))

@Composable
internal fun rememberOutlineEditorState(key: Any, initial: String, foldScope: String?, onChange: (String) -> Unit): OutlineEditorState {
    val context = LocalContext.current
    val store = remember { OutlineFoldStore(context) }
    return remember(key) { OutlineEditorState(initial, foldScope, store, onChange) }
}

/** Replis du champ : chaque partie cachée devient « … » (le texte, lui, ne change pas). */
private class FoldTransformation(private val lines: Set<Int>, private val dim: Color) : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val ranges = OutlineInput.hiddenRanges(text.text, lines)
        if (ranges.isEmpty()) return TransformedText(text, OffsetMapping.Identity)
        val mapping = FoldMapping(ranges)
        var at = 0
        val shown = buildAnnotatedString {
            for (r in ranges) {
                append(text.subSequence(at, r.first))
                withStyle(SpanStyle(color = dim)) { append(FoldMapping.PLACEHOLDER) }
                at = r.last
            }
            append(text.subSequence(at, text.length))
        }
        return TransformedText(
            shown,
            object : OffsetMapping {
                override fun originalToTransformed(offset: Int) = mapping.toTransformed(offset).coerceIn(0, shown.length)
                override fun transformedToOriginal(offset: Int) = mapping.toOriginal(offset).coerceIn(0, text.length)
            },
        )
    }

    override fun equals(other: Any?) = other is FoldTransformation && other.lines == lines && other.dim == dim

    override fun hashCode() = lines.hashCode() * 31 + dim.hashCode()
}

/** Le champ de l'éditeur en plan, avec le fil d'Ariane du zoom au-dessus. */
@Composable
internal fun OutlineField(
    state: OutlineEditorState,
    hint: String,
    style: TextStyle,
    modifier: Modifier = Modifier,
    readOnly: Boolean = false,
) {
    val palette = cadence
    val folds = state.fieldFolds
    val transformation = remember(folds, palette.outline) { FoldTransformation(folds, palette.outline) }
    // Le modificateur (focus, hauteur) va au champ, pas au fil d'Ariane : ses boutons ne prennent pas le focus.
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        if (state.zoom != null) OutlineCrumbs(state.crumbs, onOpen = state::zoomTo)
        Box(modifier.fillMaxWidth()) {
            if (state.fieldValue.text.isEmpty()) Text(hint, style = style, color = palette.outline)
            BasicTextField(
                value = state.fieldValue,
                onValueChange = state::onFieldChange,
                readOnly = readOnly,
                textStyle = style.copy(color = palette.onSurface),
                cursorBrush = SolidColor(palette.primary),
                visualTransformation = transformation,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/** « Tout › parent › … » : remonte le zoom (null : texte complet). */
@Composable
internal fun OutlineCrumbs(crumbs: List<Pair<Int, String>>, onOpen: (Int?) -> Unit) {
    val palette = cadence
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Space.xs),
    ) {
        TextButton(onClick = { onOpen(null) }) { Text(stringResource(R.string.note_outline_all), style = MaterialTheme.typography.labelLarge) }
        crumbs.forEach { (line, text) ->
            Text("›", style = MaterialTheme.typography.labelLarge, color = palette.onSurfaceVariant)
            TextButton(onClick = { onOpen(line) }) {
                Text(
                    NoteOutline.plainItemText(text).ifEmpty { "•" },
                    style = MaterialTheme.typography.labelLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.widthIn(max = Size.galleryCell),
                )
            }
        }
    }
}

/**
 * La barre au-dessus du clavier : plan (retrait, sortie, monter, descendre, replier, zoom, case, tâche liée), puis
 * mise en forme (gras, italique, barré, titre, listes, citation, code, lien, `[[`, `@`, tableau) ; au-dessus, le
 * choix des personnes ou des notes pendant la frappe d'un `@nom` ou d'un `[[titre`.
 */
@Composable
internal fun OutlineToolbar(
    state: OutlineEditorState,
    noteTitles: List<String>,
    onMakeTask: (String) -> Unit,
    onDone: () -> Unit,
) {
    val palette = cadence
    val trigger = state.trigger
    Column(Modifier.fillMaxWidth().background(palette.containerHigh)) {
        if (trigger != null) Suggestions(trigger, noteTitles, onPick = { token -> state.complete(trigger, token) })
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.weight(1f).horizontalScroll(rememberScrollState()).padding(horizontal = Space.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val onRoot = state.onRoot
                ToolButton(Icons.AutoMirrored.Outlined.FormatIndentDecrease, R.string.note_outline_outdent, enabled = !onRoot) {
                    state.command { sel, options -> NoteOutline.outdentItems(sel, options) }
                }
                ToolButton(Icons.AutoMirrored.Outlined.FormatIndentIncrease, R.string.note_outline_indent, enabled = !onRoot) {
                    state.command { sel, _ -> NoteOutline.indentItems(sel) }
                }
                ToolButton(Icons.Outlined.ArrowUpward, R.string.note_outline_move_up, enabled = !onRoot) {
                    state.command { sel, _ -> NoteOutline.moveItem(sel, -1) }
                }
                ToolButton(Icons.Outlined.ArrowDownward, R.string.note_outline_move_down, enabled = !onRoot) {
                    state.command { sel, _ -> NoteOutline.moveItem(sel, 1) }
                }
                val folded = state.caretFolded
                ToolButton(
                    if (folded == true) Icons.Outlined.UnfoldMore else Icons.Outlined.UnfoldLess,
                    if (folded == true) R.string.note_outline_unfold else R.string.note_outline_fold,
                    enabled = folded != null,
                    onClick = state::toggleFold,
                )
                ToolButton(Icons.Outlined.ZoomIn, R.string.note_outline_zoom_in, onClick = state::zoomIn)
                ToolButton(Icons.Outlined.CheckBox, R.string.note_outline_checkbox) { state.command { sel, _ -> NoteOutline.toggleItemBox(sel) } }
                ToolButton(Icons.Outlined.AddTask, R.string.note_outline_make_task) { state.makeTask()?.let(onMakeTask) }
                ToolButton(Icons.Outlined.FormatBold, R.string.tasks_note_bold) { state.format { MarkdownFormat.toggleWrap(it, "**") } }
                ToolButton(Icons.Outlined.FormatItalic, R.string.format_italic) { state.format { MarkdownFormat.toggleWrap(it, "_") } }
                ToolButton(Icons.Outlined.FormatStrikethrough, R.string.format_strike) { state.format { MarkdownFormat.toggleWrap(it, "~~") } }
                ToolButton(Icons.Outlined.Title, R.string.tasks_note_heading) { state.format(MarkdownFormat::cycleHeading) }
                ToolButton(Icons.AutoMirrored.Outlined.FormatListBulleted, R.string.tasks_note_bullets) {
                    state.format { MarkdownFormat.toggleLinePrefix(it, LineKind.BULLET) }
                }
                ToolButton(Icons.Outlined.FormatListNumbered, R.string.format_numbers) {
                    state.format { MarkdownFormat.toggleLinePrefix(it, LineKind.NUMBER) }
                }
                ToolButton(Icons.Outlined.Checklist, R.string.tasks_note_checklist) {
                    state.format { MarkdownFormat.toggleLinePrefix(it, LineKind.TASK) }
                }
                ToolButton(Icons.Outlined.FormatQuote, R.string.format_quote) { state.format { MarkdownFormat.toggleLinePrefix(it, LineKind.QUOTE) } }
                ToolButton(Icons.Outlined.Code, R.string.format_code) { state.format(MarkdownFormat::toggleCode) }
                ToolButton(Icons.Outlined.Link, R.string.format_link) { state.format(MarkdownFormat::insertLink) }
                ToolButton(Icons.Outlined.DataArray, R.string.format_note_link) {
                    state.format { sel -> MarkdownFormat.insertText(sel, "[[]]").let { it.copy(anchor = it.anchor - 2, head = it.head - 2) } }
                }
                ToolButton(Icons.Outlined.AlternateEmail, R.string.format_mention) {
                    state.format { sel ->
                        val before = sel.text.getOrNull(sel.selStart - 1)
                        MarkdownFormat.insertText(sel, if (before == null || before.isWhitespace() || before == '(') "@" else " @")
                    }
                }
                TableButton(state)
            }
            TextButton(onClick = onDone) { Text(stringResource(R.string.tasks_note_done_editing)) }
        }
    }
}

@Composable
private fun TableButton(state: OutlineEditorState) {
    var open by remember { mutableStateOf(false) }
    val context = LocalContext.current
    Box {
        ToolButton(Icons.Outlined.TableChart, R.string.format_table) { open = true }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            TABLE_SIZES.forEach { (rows, cols) ->
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.format_table_size, rows, cols)) },
                    onClick = {
                        open = false
                        state.format { MarkdownFormat.insertTable(it, rows, cols) { col -> context.getString(R.string.format_table_column, col + 1) } }
                    },
                )
            }
        }
    }
}

private val TABLE_SIZES = listOf(2 to 2, 3 to 2, 3 to 3, 4 to 3)

@Composable
private fun ToolButton(icon: ImageVector, label: Int, enabled: Boolean = true, onClick: () -> Unit) {
    IconButton(onClick = onClick, enabled = enabled, modifier = Modifier.size(Size.touch)) {
        Icon(icon, contentDescription = stringResource(label), tint = if (enabled) cadence.onSurface else cadence.outline)
    }
}

/** Les propositions du mot en cours : personnes (lues à la première ouverture) ou titres de notes. */
@Composable
private fun Suggestions(trigger: OutlineInput.Trigger, noteTitles: List<String>, onPick: (String) -> Unit) {
    val context = LocalContext.current
    val mention = trigger.kind == OutlineInput.Trigger.Kind.MENTION
    val people by produceState<List<MentionPerson>?>(null, mention) {
        if (mention) value = TasksGraph.people(context).list()
    }
    val choices: List<Pair<String, String>> = if (mention) {
        PeopleClient.matching(people.orEmpty(), trigger.query).map { it.name to OutlineInput.mentionToken(it.name, it.uid) }
    } else {
        val q = trigger.query.trim().lowercase()
        noteTitles.filter { it.isNotBlank() && it.lowercase().contains(q) }
            .sortedBy { if (it.lowercase().startsWith(q)) 0 else 1 }
            .take(SUGGESTIONS)
            .map { it to "[[$it]]" }
    }
    val palette = cadence
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Space.sm, vertical = Space.xs),
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (choices.isEmpty()) {
            if (!mention || people != null) {
                Text(
                    stringResource(if (mention) R.string.mention_none else R.string.note_link_none),
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = Space.sm),
                )
            }
        }
        choices.forEach { (label, token) ->
            Text(
                if (mention) "@$label" else label,
                style = MaterialTheme.typography.labelLarge,
                color = palette.onPrimaryContainer,
                maxLines = 1,
                modifier = Modifier
                    .clip(Radius.Pill)
                    .background(palette.primaryContainer)
                    .clickable(role = Role.Button) { onPick(token) }
                    .heightIn(min = Size.actionSm)
                    .padding(horizontal = Space.md, vertical = Space.sm),
            )
        }
    }
}

private const val SUGGESTIONS = 8
