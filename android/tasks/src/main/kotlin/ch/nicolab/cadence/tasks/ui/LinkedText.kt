package ch.nicolab.cadence.tasks.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
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
