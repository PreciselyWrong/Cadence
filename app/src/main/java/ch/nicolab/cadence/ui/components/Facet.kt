package ch.nicolab.cadence.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.ui.theme.Motion
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/**
 * Signature visuelle de Cadence : l'extérieur des surfaces est doux, la mesure intérieure
 * est structurée. La progression d'une habitude ne suit pas un cercle mais une facette -
 * un hexagone à sommet plat, aux angles à peine adoucis, dont l'arête se remplit.
 */
private fun facetPath(cx: Float, cy: Float, radius: Float, corner: Float, sides: Int = 6, rotation: Float = -60f): Path {
    val path = Path()
    val points = List(sides) { index ->
        val angle = (rotation + index * 360f / sides) * PI.toFloat() / 180f
        Offset(cx + radius * cos(angle), cy + radius * sin(angle))
    }
    points.forEachIndexed { index, point ->
        val previous = points[(index - 1 + sides) % sides]
        val next = points[(index + 1) % sides]
        val entry = point.moveToward(previous, corner)
        val exit = point.moveToward(next, corner)
        if (index == 0) path.moveTo(entry.x, entry.y) else path.lineTo(entry.x, entry.y)
        path.quadraticTo(point.x, point.y, exit.x, exit.y)
    }
    path.close()
    return path
}

private fun Offset.moveToward(target: Offset, distance: Float): Offset {
    val length = hypot(target.x - x, target.y - y).coerceAtLeast(0.001f)
    val step = distance.coerceAtMost(length / 2f) / length
    return Offset(x + (target.x - x) * step, y + (target.y - y) * step)
}

/**
 * Jauge en facette : piste complète discrète, arête pleine pour la part accomplie,
 * et l'icône de l'habitude au centre.
 */
@Composable
fun FacetGauge(
    progress: Float,
    tint: Color,
    trackColor: Color,
    modifier: Modifier = Modifier,
    size: Dp = 52.dp,
    strokeWidth: Dp = 3.dp,
    fillAlpha: Float = 0.12f,
    content: @Composable (() -> Unit)? = null,
) {
    val ratio by animateFloatAsState(progress.coerceIn(0f, 1f), Motion.expressive(), label = "facet")
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = Stroke(width = strokeWidth.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
            val radius = (this.size.minDimension - stroke.width) / 2f
            val path = facetPath(this.size.width / 2f, this.size.height / 2f, radius, radius * 0.12f)
            drawPath(path, tint.copy(alpha = fillAlpha))
            drawPath(path, trackColor, style = stroke)
            if (ratio > 0f) {
                val measure = PathMeasure().apply { setPath(path, false) }
                val traced = Path()
                measure.getSegment(0f, measure.length * ratio, traced, true)
                drawPath(traced, tint, style = stroke)
            }
        }
        content?.invoke()
    }
}

/** Variante iconique de la jauge, utilisée partout où une habitude est représentée. */
@Composable
fun HabitFacet(
    icon: ImageVector,
    label: String?,
    progress: Float,
    tint: Color,
    trackColor: Color,
    modifier: Modifier = Modifier,
    size: Dp = 52.dp,
) = FacetGauge(progress, tint, trackColor, modifier, size) {
    val iconSize = remember(size) { size * 0.42f }
    Icon(icon, label, tint = tint, modifier = Modifier.size(iconSize))
}
