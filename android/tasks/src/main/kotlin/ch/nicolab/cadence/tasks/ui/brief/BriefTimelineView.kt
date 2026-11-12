package ch.nicolab.cadence.tasks.ui.brief

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.tasks.brief.TimelineSlot
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
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
private val AXIS_MARKS = (8..22 step 2).map { hour -> hour * 60 to "$hour" }

/**
 * Frise des prochains jours sur l'axe 8 h - 22 h : graduation toutes les deux heures, une piste par jour (travail, soir,
 * événements à leur heure avec leur titre quand il tient, en rouge s'ils sont en conflit). La charge et la liste des
 * événements sont sous la piste.
 */
@Composable
internal fun BriefTimelineSection(
    days: List<TimelineDayDto>,
    today: LocalDate,
    settings: JsonObject?,
    /** Créneaux du plan d'aujourd'hui, posés sur la piste du jour. */
    slots: List<TimelineSlot> = emptyList(),
    /** Un créneau déplacé ou étiré : nouveau début et nouvelle durée, en minutes. */
    onSlot: (TimelineSlot, Int, Int) -> Unit = { _, _, _ -> },
) {
    Column(Modifier.fillMaxWidth()) {
        TimelineLegend()
        BriefAxis()
        days.forEach { day ->
            val date = runCatching { LocalDate.parse(day.date) }.getOrNull() ?: return@forEach
            val weekday = BriefSettingsJson.weekdayIndex(date.dayOfWeek)
            val evening = settings?.let { BriefSettingsJson.eveningWindow(it, weekday) }
            val note = settings?.let { BriefSettingsJson.dayNote(it, weekday) }
            Column(Modifier.padding(top = Space.md)) {
                DayHeader(title = BriefFormat.dayTitle(date, today) ?: stringResource(R.string.brief_today), load = day.load)
                Spacer(Modifier.height(Space.xs))
                BriefDayTrack(
                    day = day,
                    evening = evening,
                    partial = note != null,
                    slots = if (date == today) slots else emptyList(),
                    onSlot = onSlot,
                )
                EventsLine(day = day, note = note)
            }
        }
    }
}

@Composable
private fun TimelineLegend() {
    val colors = TimelineColors.of(cadence)
    Row(
        Modifier.fillMaxWidth().padding(bottom = Space.sm),
        horizontalArrangement = Arrangement.spacedBy(Space.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LegendItem(colors.work, stringResource(R.string.brief_legend_work))
        LegendItem(colors.evening, stringResource(R.string.brief_legend_evening))
        LegendItem(colors.event, stringResource(R.string.brief_legend_event))
        LegendItem(colors.conflict, stringResource(R.string.brief_legend_conflict))
    }
}

@Composable
private fun LegendItem(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Canvas(Modifier.size(10.dp)) { drawRoundRect(color = color, cornerRadius = CornerRadius(2.dp.toPx())) }
        Spacer(Modifier.width(Space.xs))
        Text(label, style = MaterialTheme.typography.labelSmall, color = cadence.onSurfaceVariant)
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
private fun BriefDayTrack(
    day: TimelineDayDto,
    evening: BriefEvening?,
    partial: Boolean,
    slots: List<TimelineSlot>,
    onSlot: (TimelineSlot, Int, Int) -> Unit,
) {
    val palette = cadence
    val colors = TimelineColors.of(palette)
    val measurer = rememberTextMeasurer()
    val titleStyle = MaterialTheme.typography.labelSmall
    val haptic = rememberCadenceHaptic()
    // Glisser en cours : le créneau tenu, s'il est étiré (bord droit) ou déplacé, et le chemin parcouru en pixels.
    var held by remember { mutableStateOf<TimelineSlot?>(null) }
    var resizing by remember { mutableStateOf(false) }
    var travel by remember { mutableFloatStateOf(0f) }
    val dragModifier = if (slots.isEmpty()) Modifier else Modifier.pointerInput(slots) {
        val edge = RESIZE_EDGE.toPx()
        detectDragGesturesAfterLongPress(
            onDragStart = { at ->
                val hit = slots.lastOrNull { slot ->
                    val (left, width) = BriefTimeline.span(slot.start, slot.start + slot.duration)
                    at.x in (left * size.width - edge / 2)..((left + width) * size.width + edge / 2)
                }
                if (hit != null) {
                    val (left, width) = BriefTimeline.span(hit.start, hit.start + hit.duration)
                    resizing = at.x > (left + width) * size.width - edge
                    held = hit
                    travel = 0f
                    haptic.longPress()
                }
            },
            onDrag = { change, amount ->
                if (held != null) {
                    change.consume()
                    travel += amount.x
                }
            },
            onDragEnd = {
                held?.let { slot ->
                    val delta = BriefTimeline.minutes(travel / size.width)
                    if (resizing) {
                        val duration = BriefTimeline.resized(slot.start, slot.duration, delta)
                        if (duration != slot.duration) onSlot(slot, slot.start, duration)
                    } else {
                        val start = BriefTimeline.moved(slot.start, slot.duration, delta)
                        if (start != slot.start) onSlot(slot, start, slot.duration)
                    }
                }
                held = null
                travel = 0f
            },
            onDragCancel = {
                held = null
                travel = 0f
            },
        )
    }
    Canvas(Modifier.fillMaxWidth().height(TRACK_HEIGHT).clip(RoundedCornerShape(8.dp)).then(dragModifier)) {
        drawRect(color = colors.track)
        evening?.let { window ->
            val start = BriefFormat.parseMinute(window.start) ?: return@let
            val end = BriefFormat.parseMinute(window.end) ?: return@let
            val (left, width) = BriefTimeline.span(start, end)
            drawRect(color = colors.evening, topLeft = Offset(left * size.width, 0f), size = Size(width * size.width, size.height))
        }
        day.work.forEach { block ->
            val (left, width) = BriefTimeline.span(block.start, block.end)
            val rect = Offset(left * size.width, 0f) to Size(width * size.width, size.height)
            drawRect(color = colors.work, topLeft = rect.first, size = rect.second)
            if (partial) drawHatch(rect.first, rect.second, palette.outline)
        }
        AXIS_MARKS.forEach { (minute, _) ->
            val x = size.width * BriefTimeline.fraction(minute)
            drawLine(color = colors.grid, start = Offset(x, 0f), end = Offset(x, size.height), strokeWidth = 1.dp.toPx())
        }
        day.events.filter { !it.allDay }.forEach { event ->
            val start = event.startMinute ?: return@forEach
            val end = event.endMinute ?: return@forEach
            val (left, width) = BriefTimeline.span(start, end)
            val conflict = BriefTimeline.isConflict(event, day.work)
            val inset = EVENT_INSET.toPx()
            val origin = Offset(left * size.width, inset)
            val bar = Size((width * size.width).coerceAtLeast(MIN_BAR.toPx()), size.height - 2 * inset)
            drawRoundRect(
                color = if (conflict) colors.conflict else colors.event,
                topLeft = origin,
                size = bar,
                cornerRadius = CornerRadius(4.dp.toPx()),
            )
            val padding = 4.dp.toPx()
            val room = (bar.width - 2 * padding).toInt()
            if (room >= MIN_TITLE_WIDTH.toPx()) {
                val title = measurer.measure(
                    event.title,
                    titleStyle.copy(color = if (conflict) colors.onConflict else colors.onEvent),
                    overflow = TextOverflow.Ellipsis,
                    maxLines = 1,
                    constraints = Constraints(maxWidth = room),
                )
                drawText(title, topLeft = Offset(origin.x + padding, origin.y + (bar.height - title.size.height) / 2f))
            }
        }
        val delta = BriefTimeline.minutes(travel / size.width)
        slots.forEach { slot ->
            val dragged = held?.uid == slot.uid
            val start = if (dragged && !resizing) BriefTimeline.moved(slot.start, slot.duration, delta) else slot.start
            val duration = if (dragged && resizing) BriefTimeline.resized(slot.start, slot.duration, delta) else slot.duration
            val (left, width) = BriefTimeline.span(start, start + duration)
            val inset = EVENT_INSET.toPx()
            val origin = Offset(left * size.width, inset)
            val bar = Size((width * size.width).coerceAtLeast(MIN_BAR.toPx()), size.height - 2 * inset)
            drawRoundRect(color = colors.task, topLeft = origin, size = bar, cornerRadius = CornerRadius(4.dp.toPx()))
            if (dragged) {
                drawRoundRect(
                    color = colors.onTask,
                    topLeft = origin,
                    size = bar,
                    cornerRadius = CornerRadius(4.dp.toPx()),
                    style = Stroke(width = 2.dp.toPx()),
                )
            }
            val padding = 4.dp.toPx()
            val room = (bar.width - 2 * padding).toInt()
            if (room >= MIN_TITLE_WIDTH.toPx()) {
                val title = measurer.measure(
                    slot.title,
                    titleStyle.copy(color = colors.onTask),
                    overflow = TextOverflow.Ellipsis,
                    maxLines = 1,
                    constraints = Constraints(maxWidth = room),
                )
                drawText(title, topLeft = Offset(origin.x + padding, origin.y + (bar.height - title.size.height) / 2f))
            }
        }
    }
}

private val TRACK_HEIGHT = 36.dp
private val RESIZE_EDGE = 16.dp
private val EVENT_INSET = 4.dp
private val MIN_BAR = 8.dp
private val MIN_TITLE_WIDTH = 32.dp

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
