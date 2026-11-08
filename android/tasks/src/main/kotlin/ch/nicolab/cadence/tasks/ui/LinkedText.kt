package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.ClickableText
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.links.TextLinks

/** Texte brut où les adresses, numéros et liens sont cliquables (ouverts par le système). */
internal fun linkifiedText(text: String, color: Color): AnnotatedString {
    val style = TextLinkStyles(SpanStyle(color = color, textDecoration = TextDecoration.Underline))
    return buildAnnotatedString {
        var cursor = 0
        TextLinks.matches(text).forEach { match ->
            append(text.substring(cursor, match.range.first))
            withLink(LinkAnnotation.Url(match.url, style)) { append(text.substring(match.range)) }
            cursor = match.range.last + 1
        }
        append(text.substring(cursor))
    }
}

@Suppress("DEPRECATION")
@Composable
internal fun ClickableLinkText(text: String, style: TextStyle, modifier: Modifier = Modifier) {
    val palette = cadence
    val uriHandler = LocalUriHandler.current
    val matches = remember(text) { TextLinks.matches(text) }
    val styled = remember(text, palette.primary) {
        buildAnnotatedString {
            var cursor = 0
            matches.forEach { match ->
                append(text.substring(cursor, match.range.first))
                withStyle(SpanStyle(color = palette.primary, textDecoration = TextDecoration.Underline)) {
                    append(text.substring(match.range))
                }
                cursor = match.range.last + 1
            }
            append(text.substring(cursor))
        }
    }
    ClickableText(
        text = styled,
        style = style.copy(color = palette.onSurface),
        modifier = modifier.semantics {
            onClick {
                matches.firstOrNull()?.let { runCatching { uriHandler.openUri(it.url) } }
                true
            }
        },
        onClick = { offset ->
            matches.firstOrNull { offset in it.range }?.let { runCatching { uriHandler.openUri(it.url) } }
        },
    )
}

/** A link-bearing field opens links until the user explicitly chooses to edit it. */
@Composable
internal fun LinkedEditableField(
    value: String,
    onValueChange: (String) -> Unit,
    style: TextStyle,
    readOnly: Boolean = false,
    singleLine: Boolean = false,
    onDone: (() -> Unit)? = null,
) {
    val palette = cadence
    var editing by remember { mutableStateOf(false) }
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(editing) { if (editing) focusRequester.requestFocus() }
    val hasLinks = remember(value) { TextLinks.matches(value).isNotEmpty() }
    if (hasLinks && (readOnly || !editing)) {
        Row(Modifier.fillMaxWidth()) {
            ClickableLinkText(
                text = value,
                style = style,
                modifier = Modifier.weight(1f),
            )
            if (!readOnly) {
                IconButton(onClick = { editing = true }) {
                    Icon(Icons.Outlined.Edit, contentDescription = stringResource(R.string.tasks_idea_edit))
                }
            }
        }
    } else {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            readOnly = readOnly,
            textStyle = style.copy(color = palette.onSurface),
            cursorBrush = SolidColor(palette.primary),
            singleLine = singleLine,
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Sentences,
                imeAction = if (onDone != null) ImeAction.Done else ImeAction.Default,
            ),
            keyboardActions = KeyboardActions(onDone = { editing = false; onDone?.invoke() }),
            modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
        )
    }
}
