package ch.nicolab.cadence.agenda

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size as GeometrySize
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.R
import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.designsystem.components.ICON_CONTRAST
import ch.nicolab.cadence.designsystem.components.TEXT_CONTRAST
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.theme.Motion
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.designsystem.theme.compositeOver
import ch.nicolab.cadence.designsystem.theme.readableOn
import ch.nicolab.cadence.designsystem.theme.readableTint
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin

/** Part de la couleur de la source dans le fond d'un bloc ; une fois fait, le bloc s'efface vers la carte. */
internal const val BLOCK_TINT = 0.20f
internal const val BLOCK_TINT_DONE = 0.08f

/** Repère du type d'élément : 16 dp dessinés, la zone de toucher est portée par le parent. */
internal val MARK_SIZE = 16.dp
internal val BLOCK_PADDING = 6.dp
internal val MARK_GAP = 4.dp

/** Zone de toucher du repère dans un bloc ou une puce : la marge, le repère et l'espace qui le suit. */
internal val MARK_HIT_WIDTH = 32.dp

/** Un bloc de 30 minutes ou moins tient sur une ligne : repère et titre côte à côte. */
internal const val INLINE_MAX_MINUTES = 30
internal const val MAX_TITLE_LINES = 3

/**
 * Couleurs d'un bloc de l'Agenda, toutes opaques : le fond mêle la couleur de la source à la carte
 * au lieu de la poser en transparence, si bien qu'aucun bloc ne laisse voir ce qu'il recouvre.
 * Titre et horaire gardent 4,5:1 sur ce fond, le repère 3:1.
 */
internal data class BlockColors(val fill: Int, val mark: Int, val title: Int, val meta: Int, val onMark: Int)

internal fun blockColors(sourceArgb: Int, cardArgb: Int, onSurfaceArgb: Int, onSurfaceVariantArgb: Int, done: Boolean): BlockColors {
    val fill = compositeOver(sourceArgb, if (done) BLOCK_TINT_DONE else BLOCK_TINT, cardArgb)
    val mark = readableTint(sourceArgb, fill, ICON_CONTRAST)
    val meta = readableTint(onSurfaceVariantArgb, fill, TEXT_CONTRAST)
    val title = if (done) meta else readableTint(onSurfaceArgb, fill, TEXT_CONTRAST)
    return BlockColors(fill = fill, mark = mark, title = title, meta = meta, onMark = readableOn(mark))
}

@Composable
internal fun rememberBlockColors(entry: AgendaEntry): BlockColors {
    val palette = cadence
    val source = (entry.colorArgb?.let { Color(it) } ?: palette.primary).toArgb()
    val card = palette.card.toArgb()
    val ink = palette.onSurface.toArgb()
    val variant = palette.onSurfaceVariant.toArgb()
    return remember(source, card, ink, variant, entry.done) { blockColors(source, card, ink, variant, entry.done) }
}

/** Ce qu'un bloc horaire affiche : une ligne à côté du repère, ou jusqu'à trois lignes de titre puis l'horaire. */
internal data class BlockText(val inline: Boolean, val titleLines: Int, val showTime: Boolean)

/**
 * Le titre passe avant l'horaire : l'horaire n'a sa ligne que si le titre entier ([neededTitleLines],
 * borné à trois) tient au-dessus ; sinon le titre prend toute la hauteur. Jamais moins d'une ligne.
 * [markAboveDp] : hauteur du repère posé au-dessus du titre dans une colonne trop étroite.
 */
internal fun blockText(
    minutes: Int,
    heightDp: Float,
    titleLineDp: Float,
    timeLineDp: Float,
    neededTitleLines: Int,
    markAboveDp: Float = 0f,
    paddingDp: Float = BLOCK_PADDING.value,
): BlockText {
    val available = heightDp - 2 * paddingDp - markAboveDp
    if (minutes <= INLINE_MAX_MINUTES || available < titleLineDp) return BlockText(inline = true, titleLines = 1, showTime = false)
    val needed = neededTitleLines.coerceIn(1, MAX_TITLE_LINES)
    if (needed * titleLineDp + timeLineDp <= available) return BlockText(inline = false, titleLines = needed, showTime = true)
    val fit = floor(available / titleLineDp).toInt().coerceIn(1, MAX_TITLE_LINES)
    return BlockText(inline = false, titleLines = fit, showTime = false)
}

/** Largeur de texte sous laquelle le titre ne tient plus à côté du repère (deux ou trois lettres). */
internal const val MIN_TEXT_BESIDE_MARK_DP = 40f

/** Le repère se pose à côté du titre si, une fois retiré, il reste [MIN_TEXT_BESIDE_MARK_DP] au titre. */
internal fun markFitsBeside(innerWidthDp: Float): Boolean =
    innerWidthDp - MARK_SIZE.value - MARK_GAP.value >= MIN_TEXT_BESIDE_MARK_DP

/** Forme du repère : la case carrée se coche (tâche), le rond se coche (événement), le point non, l'hexagone est l'habitude. */
internal enum class MarkShape { TASK, EVENT_CHECK, EVENT_DOT, HABIT }

internal fun markShapeOf(entry: AgendaEntry, checkEvents: Boolean): MarkShape = when (entry) {
    is AgendaEntry.Task -> MarkShape.TASK
    is AgendaEntry.Event -> if (checkEvents) MarkShape.EVENT_CHECK else MarkShape.EVENT_DOT
    is AgendaEntry.Habit -> MarkShape.HABIT
}

/** Seules la tâche et l'événement cochable se cochent depuis le repère ; l'habitude s'ouvre par le bloc. */
internal fun MarkShape.toggles(): Boolean = this == MarkShape.TASK || this == MarkShape.EVENT_CHECK

/** Repère de 16 dp : contour à la couleur de la source, plein (et coché) une fois l'élément fait. */
@Composable
internal fun AgendaMark(shape: MarkShape, done: Boolean, color: Color, onColor: Color, modifier: Modifier = Modifier) {
    val fill by animateFloatAsState(if (done) 1f else 0f, tween(Motion.COLOR), label = "markFill")
    Canvas(modifier.size(MARK_SIZE)) {
        val stroke = 1.5.dp.toPx()
        when (shape) {
            MarkShape.TASK -> {
                val inset = 1.dp.toPx() + stroke / 2
                val side = size.width - inset * 2
                val corner = CornerRadius(3.5.dp.toPx())
                drawRoundRect(color, Offset(inset, inset), GeometrySize(side, side), corner, style = Stroke(stroke))
                if (fill > 0f) {
                    drawRoundRect(color.copy(alpha = fill), Offset(inset, inset), GeometrySize(side, side), corner)
                    drawCheck(onColor, fill)
                }
            }
            MarkShape.EVENT_CHECK -> {
                val radius = size.minDimension / 2 - 1.dp.toPx() - stroke / 2
                drawCircle(color, radius, style = Stroke(stroke))
                if (fill > 0f) {
                    drawCircle(color.copy(alpha = fill), radius)
                    drawCheck(onColor, fill)
                }
            }
            MarkShape.EVENT_DOT -> drawCircle(color, 4.dp.toPx())
            MarkShape.HABIT -> {
                val hexagon = hexagonPath(center, size.minDimension / 2 - stroke / 2)
                drawPath(hexagon, color, style = Stroke(stroke, join = StrokeJoin.Round))
                if (fill > 0f) drawPath(hexagon, color.copy(alpha = fill))
            }
        }
    }
}

private fun DrawScope.drawCheck(color: Color, alpha: Float) {
    val path = Path().apply {
        moveTo(size.width * 0.28f, size.height * 0.52f)
        lineTo(size.width * 0.44f, size.height * 0.68f)
        lineTo(size.width * 0.73f, size.height * 0.34f)
    }
    drawPath(path, color.copy(alpha = alpha), style = Stroke(1.75.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
}

/** Hexagone pointe en haut : il se distingue du carré et du rond même à 16 dp. */
private fun hexagonPath(center: Offset, radius: Float): Path = Path().apply {
    for (corner in 0 until 6) {
        val angle = Math.toRadians(-90.0 + 60.0 * corner)
        val point = Offset(center.x + radius * cos(angle).toFloat(), center.y + radius * sin(angle).toFloat())
        if (corner == 0) moveTo(point.x, point.y) else lineTo(point.x, point.y)
    }
    close()
}

/**
 * Zone de toucher invisible qui coche une tâche ou un événement : le repère reste petit, la cible
 * couvre la marge, le repère et l'espace qui le suit. Une occurrence à venir est confiée à
 * [onToggleTask], qui ouvre la fiche de la tâche enregistrée.
 */
@Composable
internal fun Modifier.markToggle(
    entry: AgendaEntry,
    checkEvents: Boolean,
    onToggleEvent: (EventInstanceKey) -> Unit,
    onToggleTask: (AgendaEntry.Task) -> Unit,
): Modifier {
    if (!markShapeOf(entry, checkEvents).toggles()) return this
    val haptic = rememberCadenceHaptic()
    val label = stringResource(if (entry.done) R.string.agenda_mark_undone else R.string.agenda_mark_done)
    return toggleable(
        value = entry.done,
        interactionSource = remember { MutableInteractionSource() },
        indication = LocalIndication.current,
        role = Role.Checkbox,
        onValueChange = { checked ->
            if (checked) haptic.confirm() else haptic.tap()
            when (entry) {
                is AgendaEntry.Task -> onToggleTask(entry)
                is AgendaEntry.Event -> onToggleEvent(entry.eventKey)
                is AgendaEntry.Habit -> Unit
            }
        },
    ).semantics { contentDescription = label }
}

/** Repère d'un élément à ses couleurs de bloc ; une occurrence à venir est atténuée. */
@Composable
internal fun EntryMark(entry: AgendaEntry, colors: BlockColors, checkEvents: Boolean, modifier: Modifier = Modifier) {
    val virtual = entry is AgendaEntry.Task && entry.virtual
    AgendaMark(
        shape = markShapeOf(entry, checkEvents),
        done = entry.done,
        color = Color(colors.mark),
        onColor = Color(colors.onMark),
        modifier = modifier.alpha(if (virtual) VIRTUAL_ALPHA else 1f),
    )
}
