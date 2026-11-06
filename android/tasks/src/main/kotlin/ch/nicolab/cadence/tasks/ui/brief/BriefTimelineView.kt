package ch.nicolab.cadence.tasks.ui.brief

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.brief.BriefEvening
import ch.nicolab.cadence.tasks.brief.BriefSettingsJson
import ch.nicolab.cadence.tasks.brief.BriefTimeline
import ch.nicolab.cadence.tasks.brief.LoadDto
import ch.nicolab.cadence.tasks.brief.TimelineDayDto
import ch.nicolab.cadence.tasks.brief.LoadLabel
import java.time.LocalDate
import kotlinx.serialization.json.JsonObject

/** Repères de l'axe : minutes après minuit et libellé. */
private val AXIS_MARKS = listOf(8 * 60 to "8 h", 12 * 60 to "12 h", 17 * 60 to "17 h", 22 * 60 to "22 h")

/**
 * Frise des trois prochains jours : axe 8 h - 22 h, puis une piste par jour (plages de travail grises, hachurées
 * les jours partiels ; créneau du soir teinté avec le planifié ; événements en barres, rouges en conflit). Pas de texte
 * dans les bandes ; le libellé de charge et la liste des événements sont sous la piste.
 */
@Composable
internal fun BriefTimelineSection(days: List<TimelineDayDto>, today: LocalDate, settings: JsonObject?) {
    Column(Modifier.fillMaxWidth()) {
        BriefAxis()
        days.forEach { day ->
            val date = runCatching { LocalDate.parse(day.date) }.getOrNull() ?: return@forEach
            val weekday = BriefSettingsJson.weekdayIndex(date.dayOfWeek)
            val evening = settings?.let { BriefSettingsJson.eveningWindow(it, weekday) }
            val note = settings?.let { BriefSettingsJson.dayNote(it, weekday) }
            Column(Modifier.padding(top = Space.md)) {
                DayHeader(title = BriefFormat.dayTitle(date, today) ?: stringResource(R.string.brief_today), load = day.load)
                Spacer(Modifier.height(Space.xs))
                BriefDayTrack(day = day, evening = evening, partial = note != null)
                EventsLine(day = day, note = note)
            }
        }
    }
}

@Composable
private fun BriefAxis() {
    val measurer = rememberTextMeasurer()
    val style = MaterialTheme.typography.labelSmall.copy(color = cadence.onSurfaceVariant)
    Canvas(Modifier.fillMaxWidth().height(16.dp)) {
        AXIS_MARKS.forEach { (minute, label) ->
            val text = measurer.measure(label, style)
            val centre = size.width * BriefTimeline.fraction(minute)
            val left = (centre - text.size.width / 2f).coerceIn(0f, (size.width - text.size.width).coerceAtLeast(0f))
            drawText(text, topLeft = Offset(left, 0f))
        }
    }
}

@Composable
private fun DayHeader(title: String, load: LoadDto) {
    val palette = cadence
    val state = BriefTimeline.load(load)
    val label = when (state) {
        is LoadLabel.Plain -> durationLabel(state.minutes)
        is LoadLabel.Ratio -> stringResource(R.string.brief_load_ratio, durationLabel(state.planned), durationLabel(state.capacity))
        is LoadLabel.Over -> stringResource(R.string.brief_load_over, durationLabel(state.planned), durationLabel(state.capacity))
    }
    val over = state is LoadLabel.Over
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(title, style = MaterialTheme.typography.titleSmall, color = palette.onSurface)
        Spacer(Modifier.width(Space.md))
        Text(
            label,
            modifier = Modifier.weight(1f),
            textAlign = TextAlign.End,
            style = MaterialTheme.typography.bodySmall,
            color = if (over) palette.error else palette.onSurfaceVariant,
            fontWeight = if (over) FontWeight.Bold else null,
        )
    }
}

@Composable
private fun BriefDayTrack(day: TimelineDayDto, evening: BriefEvening?, partial: Boolean) {
    val palette = cadence
    val load = day.load
    Canvas(Modifier.fillMaxWidth().height(28.dp)) {
        val track = CornerRadius(8.dp.toPx())
        drawRoundRect(color = palette.containerLow, cornerRadius = track)
        evening?.let { window ->
            val start = BriefFormat.parseMinute(window.start) ?: return@let
            val end = BriefFormat.parseMinute(window.end) ?: return@let
            val (left, width) = BriefTimeline.span(start, end)
            val fill = BriefTimeline.fill(load.plannedMinutes, window.minutes)
            drawRect(
                color = palette.primaryContainer,
                topLeft = Offset(left * size.width, 0f),
                size = Size(width * size.width * fill, size.height),
            )
        }
        day.work.forEach { block ->
            val (left, width) = BriefTimeline.span(block.start, block.end)
            val rect = Offset(left * size.width, 0f) to Size(width * size.width, size.height)
            drawRect(color = palette.containerHigh, topLeft = rect.first, size = rect.second)
            if (partial) drawHatch(rect.first, rect.second, palette.outline)
        }
        day.events.filter { !it.allDay }.forEach { event ->
            val start = event.startMinute ?: return@forEach
            val end = event.endMinute ?: return@forEach
            val (left, width) = BriefTimeline.span(start, end)
            val color = if (BriefTimeline.isConflict(event, day.work)) palette.error else palette.onSurfaceVariant
            drawRoundRect(
                color = color,
                topLeft = Offset(left * size.width, 9.dp.toPx()),
                size = Size((width * size.width).coerceAtLeast(MIN_BAR.toPx()), size.height - 18.dp.toPx()),
                cornerRadius = CornerRadius(5.dp.toPx()),
            )
        }
    }
}

private val MIN_BAR = 8.dp

/** Hachures diagonales dans un rectangle : marque les plages de travail d'un jour partiel. */
private fun DrawScope.drawHatch(topLeft: Offset, size: Size, color: Color) {
    val stroke = 1.dp.toPx()
    val step = 6.dp.toPx()
    clipRect(topLeft.x, topLeft.y, topLeft.x + size.width, topLeft.y + size.height) {
        var x = topLeft.x - size.height
        while (x < topLeft.x + size.width) {
            drawLine(color = color, start = Offset(x, topLeft.y + size.height), end = Offset(x + size.height, topLeft.y), strokeWidth = stroke)
            x += step
        }
    }
}

@Composable
private fun EventsLine(day: TimelineDayDto, note: String?) {
    val palette = cadence
    val text: AnnotatedString = buildAnnotatedString {
        val events = day.events.sortedBy { it.startMinute ?: Int.MAX_VALUE }
        events.forEachIndexed { index, event ->
            if (index > 0) append(" · ")
            val label = if (event.allDay) event.title else "${BriefFormat.clock(event.startMinute ?: 0)} ${event.title}"
            if (BriefTimeline.isConflict(event, day.work)) {
                withStyle(SpanStyle(color = palette.error, fontWeight = FontWeight.Medium)) { append(label) }
            } else {
                append(label)
            }
        }
        note?.let {
            if (events.isNotEmpty()) append(" · ")
            append(it)
        }
    }
    if (text.isNotEmpty()) {
        Text(text, style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant, modifier = Modifier.padding(top = Space.xs))
    }
}
