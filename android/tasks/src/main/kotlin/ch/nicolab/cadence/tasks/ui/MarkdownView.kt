package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.LinkInteractionListener
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.components.Hairline
import ch.nicolab.cadence.designsystem.components.TaskCheckbox
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.notes.ContentRef
import ch.nicolab.cadence.tasks.notes.ContentTargets
import ch.nicolab.cadence.tasks.notes.Markdown
import ch.nicolab.cadence.tasks.notes.MdBlock
import ch.nicolab.cadence.tasks.notes.MdRun
import ch.nicolab.cadence.tasks.notes.NoteOutline
import ch.nicolab.cadence.tasks.notes.OutlineFoldStore

private val INDENT_STEP = 20.dp
private val QUOTE_BAR = 3.dp

/** Ouvre la note dont le titre est [title] (lien `[[titre]]`) ; absente, c'est à l'appelant de le dire. */
private val LocalWikiLinkHandler = compositionLocalOf<(String) -> Unit> { {} }

/** Ouvre la cible d'un lien interne (tâche, note par uid) ; null : la puce se lit sans s'ouvrir. */
private val LocalRefHandler = compositionLocalOf<((ContentRef) -> Unit)?> { null }

/** Notes et tâches connues : une cible absente se lit en puce « + » (le toucher la crée, côté appelant). */
private val LocalTargets = compositionLocalOf<ContentTargets?> { null }

/** Ce que le plan ajoute à une puce lue : repli, zoom, case liée à une tâche. */
private class ItemOutline(
    val foldable: Boolean,
    val folded: Boolean,
    val onFold: () -> Unit,
    /** Null : pas de zoom (puce numérotée ou à case). */
    val onZoom: (() -> Unit)?,
)

/**
 * Rend un contenu markdown ; cocher une case appelle [onToggleCheckbox] avec l'index de sa ligne source,
 * toucher un lien `[[titre]]` appelle [onWikiLink] avec ce titre.
 */
@Composable
internal fun MarkdownView(
    content: String,
    onToggleCheckbox: (line: Int) -> Unit,
    modifier: Modifier = Modifier,
    onWikiLink: (title: String) -> Unit = {},
    /** Toucher une puce de tâche ou un lien vers une note par uid ; une personne n'a pas de fiche sur Android. */
    onRef: ((ContentRef) -> Unit)? = null,
    /**
     * Lecture en plan (`docs/45-outliner.md`) : chevrons de repli et zoom sur une puce ; replis gardés sur l'appareil
     * sous cette clé (`note:<uid>`, `task:<uid>`), partagés avec l'éditeur. Null : listes simples.
     */
    outlineScope: String? = null,
    /** Notes et tâches de l'appareil : cibles inconnues en puces « + », cases des puces `[[task:Nom]]` liées à la tâche. */
    targets: ContentTargets? = null,
    /** Toucher la case d'une puce liée termine ou rouvre la tâche ; le texte n'est pas réécrit. */
    onToggleTask: ((TaskItem) -> Unit)? = null,
) {
    val context = LocalContext.current
    val outline = remember(content) { NoteOutline.parse(content) }
    val keys = remember(outline) { NoteOutline.itemKeys(outline) }
    var zoomLine by remember(outlineScope) { mutableStateOf<Int?>(null) }
    val zoomed = zoomLine?.takeIf { outlineScope != null && NoteOutline.itemAtLine(outline, it) >= 0 }
    val shown = remember(content, zoomed) { zoomed?.let { NoteOutline.subtreeText(content, it) } ?: content }
    val offset = zoomed ?: 0
    val blocks = remember(shown) { Markdown.parse(shown) }
    val store = remember { OutlineFoldStore(context) }
    var folds by remember(outlineScope) { mutableStateOf(outlineScope?.let { store.load(it).toSet() }.orEmpty()) }
    fun setFold(key: String, folded: Boolean) {
        folds = if (folded) folds + key else folds - key
        outlineScope?.let { store.save(it, folds) }
    }
    // Lignes (du texte complet) cachées par un repli.
    val hidden = remember(outline, keys, folds) {
        if (outlineScope == null) emptySet() else buildSet {
            outline.items.forEach { item ->
                if (keys[item.line] in folds && NoteOutline.foldRange(outline, item.line) != null) addAll(item.line + 1..item.end)
            }
        }
    }
    val crumbs = zoomed?.let { z ->
        NoteOutline.ancestorLines(outline, z).dropLast(1).map { line -> line to outline.items[NoteOutline.itemAtLine(outline, line)].text }
    }
    CompositionLocalProvider(LocalWikiLinkHandler provides onWikiLink, LocalRefHandler provides onRef, LocalTargets provides targets) {
        Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            crumbs?.let { OutlineCrumbs(it, onOpen = { line -> zoomLine = line }) }
            blocks.forEach { block ->
                val line = block.line + offset
                if (line in hidden) return@forEach
                when (block) {
                    is MdBlock.Heading -> InlineText(block.text, headingStyle(block.level), bold = true)
                    is MdBlock.Paragraph -> InlineText(block.text, MaterialTheme.typography.bodyLarge)
                    is MdBlock.Item -> {
                        val item = if (outlineScope != null) outline.items.getOrNull(NoteOutline.itemAtLine(outline, line)) else null
                        val itemOutline = item?.let {
                            val key = keys[it.line].orEmpty()
                            val foldable = NoteOutline.foldRange(outline, it.line) != null
                            ItemOutline(
                                foldable = foldable,
                                folded = foldable && key in folds,
                                onFold = { setFold(key, key !in folds) },
                                onZoom = if (it.box.isEmpty() && !it.marker.any(Char::isDigit)) {
                                    {
                                        setFold(key, false)
                                        zoomLine = it.line
                                    }
                                } else null,
                            )
                        }
                        val linked = if (block.checked != null) {
                            NoteOutline.TASK_ITEM_LINK.find(block.text)?.groupValues?.get(1)?.let { name -> targets?.task(name) }
                        } else null
                        ItemRow(
                            block,
                            checked = linked?.isClosed ?: block.checked,
                            onToggle = { if (linked != null && onToggleTask != null) onToggleTask(linked) else onToggleCheckbox(line) },
                            outline = itemOutline,
                        )
                    }
                    is MdBlock.Quote -> QuoteRow(block.text)
                    is MdBlock.Code -> CodeBlock(block.text)
                    is MdBlock.Rule -> Hairline(Modifier.padding(vertical = Space.sm))
                    is MdBlock.Table -> TableBlock(block)
                }
            }
        }
    }
}

@Composable
private fun headingStyle(level: Int): TextStyle = when (level) {
    1 -> MaterialTheme.typography.headlineSmall
    2 -> MaterialTheme.typography.titleLarge
    else -> MaterialTheme.typography.titleMedium
}

@Composable
private fun InlineText(text: String, style: TextStyle, modifier: Modifier = Modifier, bold: Boolean = false, dim: Boolean = false, struck: Boolean = false) {
    val palette = cadence
    val linkStyle = TextLinkStyles(SpanStyle(color = palette.primary, textDecoration = TextDecoration.Underline))
    val chipStyle = TextLinkStyles(SpanStyle(color = palette.onPrimaryContainer, background = palette.primaryContainer, fontWeight = FontWeight.Medium))
    val codeBackground = palette.containerHigh
    val missingStyle = TextLinkStyles(SpanStyle(color = palette.onSurfaceVariant, background = palette.containerHigh, fontWeight = FontWeight.Medium))
    val onWikiLink = LocalWikiLinkHandler.current
    val onRef = LocalRefHandler.current
    val targets = LocalTargets.current
    val annotated = remember(text, linkStyle, chipStyle, missingStyle, codeBackground, onWikiLink, onRef, targets) {
        annotate(Markdown.inline(text), linkStyle, chipStyle, missingStyle, codeBackground, onWikiLink, onRef) { targets?.missing(it) == true }
    }
    Text(
        text = annotated,
        style = style.merge(
            TextStyle(
                fontWeight = if (bold) FontWeight.SemiBold else null,
                textDecoration = if (struck) TextDecoration.LineThrough else null,
            ),
        ),
        color = if (dim) palette.onSurfaceVariant else palette.onSurface,
        modifier = modifier,
    )
}

private fun annotate(
    runs: List<MdRun>,
    linkStyle: TextLinkStyles,
    chipStyle: TextLinkStyles,
    missingStyle: TextLinkStyles,
    codeBackground: androidx.compose.ui.graphics.Color,
    onWikiLink: (String) -> Unit,
    onRef: ((ContentRef) -> Unit)?,
    isMissing: (MdRun) -> Boolean,
): AnnotatedString =
    buildAnnotatedString {
        runs.forEach { run ->
            val style = SpanStyle(
                fontWeight = if (run.bold) FontWeight.Bold else null,
                fontStyle = if (run.italic) FontStyle.Italic else null,
                fontFamily = if (run.code) FontFamily.Monospace else null,
                background = if (run.code) codeBackground else androidx.compose.ui.graphics.Color.Unspecified,
                textDecoration = if (run.strike) TextDecoration.LineThrough else null,
            )
            val wiki = run.wiki
            val ref = run.ref
            // Une cible absente se lit estompée, précédée de « + » : le toucher la crée.
            val missing = (wiki != null || ref is ContentRef.Task) && isMissing(run)
            val label = if (missing) "+ ${run.text}" else run.text
            val chip = if (missing) missingStyle else chipStyle
            if (ref != null) {
                // Une personne n'a pas de fiche sur l'appareil : sa puce se lit sans s'ouvrir.
                if (onRef != null && ref !is ContentRef.Person) {
                    val listener = LinkInteractionListener { onRef(ref) }
                    withLink(LinkAnnotation.Clickable(tag = run.text, styles = chip, linkInteractionListener = listener)) {
                        withStyle(style) { append(label) }
                    }
                } else {
                    withStyle(chipStyle.style ?: SpanStyle()) { withStyle(style) { append(run.text) } }
                }
            } else if (wiki != null) {
                val listener = LinkInteractionListener { onWikiLink(wiki) }
                withLink(LinkAnnotation.Clickable(tag = wiki, styles = chip, linkInteractionListener = listener)) {
                    withStyle(style) { append(label) }
                }
            } else if (run.link != null) {
                withLink(LinkAnnotation.Url(run.link, linkStyle)) { withStyle(style) { append(run.text) } }
            } else {
                withStyle(style) { append(run.text) }
            }
        }
    }

@Composable
private fun ItemRow(item: MdBlock.Item, checked: Boolean?, onToggle: () -> Unit, outline: ItemOutline?) {
    val palette = cadence
    Row(
        Modifier.fillMaxWidth().padding(start = INDENT_STEP * (item.indent / 2)),
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
        verticalAlignment = Alignment.Top,
    ) {
        if (outline != null) FoldCaret(outline)
        when {
            checked != null -> Box(Modifier.heightIn(min = Size.iconLarge + Space.xs)) {
                TaskCheckbox(
                    checked = checked,
                    onCheckedChange = { onToggle() },
                    contentDescription = NoteOutline.plainItemText(item.text),
                )
            }
            else -> {
                val zoom = outline?.onZoom
                Text(
                    text = item.number?.let { "$it." } ?: "•",
                    style = MaterialTheme.typography.bodyLarge,
                    color = palette.onSurfaceVariant,
                    modifier = Modifier
                        .width(Size.iconLarge)
                        .then(
                            if (zoom != null) Modifier.clickable(role = Role.Button, onClickLabel = stringResource(R.string.note_outline_zoom_in), onClick = zoom)
                            else Modifier,
                        ),
                )
            }
        }
        InlineText(
            item.text,
            MaterialTheme.typography.bodyLarge,
            Modifier.weight(1f, fill = outline?.folded != true),
            dim = checked == true,
            struck = checked == true,
        )
        if (outline?.folded == true) {
            Text(
                "…",
                style = MaterialTheme.typography.labelLarge,
                color = palette.onSurfaceVariant,
                modifier = Modifier
                    .clip(Radius.Pill)
                    .background(palette.containerHigh)
                    .clickable(role = Role.Button, onClickLabel = stringResource(R.string.note_outline_unfold), onClick = outline.onFold)
                    .padding(horizontal = Space.sm),
            )
        }
    }
}

/** Chevron de repli devant une puce qui a quelque chose dessous ; place vide sinon, pour garder l'alignement. */
@Composable
private fun FoldCaret(outline: ItemOutline) {
    val label = stringResource(if (outline.folded) R.string.note_outline_unfold else R.string.note_outline_fold)
    Box(
        Modifier
            .width(INDENT_STEP)
            .heightIn(min = Size.iconLarge + Space.xs)
            .then(if (outline.foldable) Modifier.clickable(role = Role.Button, onClickLabel = label, onClick = outline.onFold) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        if (outline.foldable) {
            Icon(
                if (outline.folded) Icons.Outlined.ChevronRight else Icons.Outlined.ExpandMore,
                contentDescription = label,
                tint = cadence.onSurfaceVariant,
                modifier = Modifier.size(Size.iconSm),
            )
        }
    }
}

@Composable
private fun QuoteRow(text: String) {
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
        Box(Modifier.width(QUOTE_BAR).fillMaxHeight().clip(Radius.Pill).background(cadence.outline))
        InlineText(text, MaterialTheme.typography.bodyLarge, Modifier.weight(1f), dim = true)
    }
}

@Composable
private fun CodeBlock(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
        color = cadence.onSurface,
        modifier = Modifier.fillMaxWidth().clip(Radius.Chip).background(cadence.containerHigh).padding(Space.md),
    )
}

/** Tableau : l'en-tête en gras, une ligne par rangée, colonnes de même largeur, filets entre les rangées. */
@Composable
private fun TableBlock(table: MdBlock.Table) {
    val palette = cadence
    Column(Modifier.fillMaxWidth().clip(Radius.Chip).background(palette.containerLow)) {
        TableRow(table.header, bold = true)
        table.rows.forEach { row ->
            Hairline()
            TableRow(row, bold = false)
        }
    }
}

@Composable
private fun TableRow(cells: List<String>, bold: Boolean) {
    Row(Modifier.fillMaxWidth().padding(horizontal = Space.sm, vertical = Space.xs), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
        cells.forEach { cell -> InlineText(cell, MaterialTheme.typography.bodyMedium, Modifier.weight(1f), bold = bold) }
    }
}
