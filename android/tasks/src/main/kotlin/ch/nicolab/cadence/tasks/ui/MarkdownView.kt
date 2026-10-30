package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
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
import ch.nicolab.cadence.tasks.notes.Markdown
import ch.nicolab.cadence.tasks.notes.MdBlock
import ch.nicolab.cadence.tasks.notes.MdRun

private val INDENT_STEP = 20.dp
private val QUOTE_BAR = 3.dp

/** Rend un contenu markdown ; cocher une case appelle [onToggleCheckbox] avec l'index de sa ligne source. */
@Composable
internal fun MarkdownView(content: String, onToggleCheckbox: (line: Int) -> Unit, modifier: Modifier = Modifier) {
    val blocks = remember(content) { Markdown.parse(content) }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        blocks.forEach { block ->
            when (block) {
                is MdBlock.Heading -> InlineText(block.text, headingStyle(block.level), bold = true)
                is MdBlock.Paragraph -> InlineText(block.text, MaterialTheme.typography.bodyLarge)
                is MdBlock.Item -> ItemRow(block, onToggleCheckbox)
                is MdBlock.Quote -> QuoteRow(block.text)
                is MdBlock.Code -> CodeBlock(block.text)
                is MdBlock.Rule -> Hairline(Modifier.padding(vertical = Space.sm))
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
    val codeBackground = palette.containerHigh
    val annotated = remember(text, linkStyle, codeBackground) { annotate(Markdown.inline(text), linkStyle, codeBackground) }
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

private fun annotate(runs: List<MdRun>, linkStyle: TextLinkStyles, codeBackground: androidx.compose.ui.graphics.Color): AnnotatedString =
    buildAnnotatedString {
        runs.forEach { run ->
            val style = SpanStyle(
                fontWeight = if (run.bold) FontWeight.Bold else null,
                fontStyle = if (run.italic) FontStyle.Italic else null,
                fontFamily = if (run.code) FontFamily.Monospace else null,
                background = if (run.code) codeBackground else androidx.compose.ui.graphics.Color.Unspecified,
                textDecoration = if (run.strike) TextDecoration.LineThrough else null,
            )
            if (run.link != null) {
                withLink(LinkAnnotation.Url(run.link, linkStyle)) { withStyle(style) { append(run.text) } }
            } else {
                withStyle(style) { append(run.text) }
            }
        }
    }

@Composable
private fun ItemRow(item: MdBlock.Item, onToggleCheckbox: (Int) -> Unit) {
    val palette = cadence
    Row(
        Modifier.fillMaxWidth().padding(start = INDENT_STEP * (item.indent / 2)),
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
        verticalAlignment = Alignment.Top,
    ) {
        when {
            item.checked != null -> Box(Modifier.heightIn(min = Size.iconLarge + Space.xs)) {
                TaskCheckbox(
                    checked = item.checked,
                    onCheckedChange = { onToggleCheckbox(item.line) },
                )
            }
            else -> Text(
                text = item.number?.let { "$it." } ?: "•",
                style = MaterialTheme.typography.bodyLarge,
                color = palette.onSurfaceVariant,
                modifier = Modifier.width(Size.iconLarge),
            )
        }
        InlineText(
            item.text,
            MaterialTheme.typography.bodyLarge,
            Modifier.weight(1f),
            dim = item.checked == true,
            struck = item.checked == true,
        )
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
