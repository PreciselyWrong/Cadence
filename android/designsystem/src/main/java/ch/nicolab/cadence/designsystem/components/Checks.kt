package ch.nicolab.cadence.designsystem.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material3.Icon
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.selection.toggleable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.graphics.graphicsLayer
import kotlinx.coroutines.launch
import ch.nicolab.cadence.designsystem.theme.Motion
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.cadence

/** Case de tâche : ronde comme sur le web, trait primaire ou erreur pour une priorité haute seulement. */
@Composable
fun TaskCheckbox(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    highPriority: Boolean = false,
    contentDescription: String? = null,
) {
    val palette = cadence
    val stroke = when {
        checked -> palette.primary
        highPriority -> palette.error
        else -> palette.outline
    }
    CheckSurface(
        checked = checked,
        onCheckedChange = onCheckedChange,
        modifier = modifier,
        shape = Radius.Checkbox,
        fill = palette.primary,
        stroke = stroke,
        mark = palette.onPrimary,
        contentDescription = contentDescription,
    )
}

/**
 * Icône d'agenda qui sert de case d'événement : contour à la couleur du calendrier, coche d'agenda
 * une fois faite. Zone tactile de 48 dp, comme la case d'une tâche.
 */
@Composable
fun EventCheck(
    checked: Boolean,
    color: Color,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
) {
    val haptic = rememberCadenceHaptic()
    Box(
        modifier
            .size(Size.touch)
            .toggleable(
                value = checked,
                interactionSource = remember { MutableInteractionSource() },
                indication = LocalIndication.current,
                role = Role.Checkbox,
                onValueChange = {
                    if (it) haptic.confirm() else haptic.tap()
                    onCheckedChange(it)
                },
            )
            .semantics {
                contentDescription?.let { this.contentDescription = it }
            },
        contentAlignment = Alignment.Center,
    ) {
        EventGlyphIcon(eventGlyphOf(checked), color)
    }
}

/** Icône d'agenda sans action, quand « Cocher un événement » est désactivé. */
@Composable
fun EventMarkDecoration(checked: Boolean, color: Color, modifier: Modifier = Modifier) {
    Box(modifier.size(Size.touch), contentAlignment = Alignment.Center) {
        EventGlyphIcon(eventGlyphOf(checked), color)
    }
}

@Composable
private fun EventGlyphIcon(glyph: EventGlyph, color: Color) {
    Icon(
        imageVector = when (glyph) {
            EventGlyph.CALENDAR -> Icons.Outlined.CalendarToday
            EventGlyph.CALENDAR_CHECKED -> Icons.Outlined.EventAvailable
        },
        contentDescription = null,
        tint = color,
        modifier = Modifier.size(Size.checkbox),
    )
}

/**
 * Zone tactile de 48 dp qui dessine la case : le remplissage et le trait se transitionnent
 * entre l'état coché et non coché.
 */
@Composable
private fun CheckSurface(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier,
    shape: Shape,
    fill: Color,
    stroke: Color,
    mark: Color,
    contentDescription: String?,
) {
    val haptic = rememberCadenceHaptic()
    val fillColor by animateColorAsState(
        targetValue = if (checked) fill else Color.Transparent,
        animationSpec = Motion.color(),
        label = "checkFill",
    )
    val strokeColor by animateColorAsState(
        targetValue = stroke,
        animationSpec = Motion.color(),
        label = "checkStroke",
    )
    val drawProgress by animateFloatAsState(
        targetValue = if (checked) 1f else 0f,
        animationSpec = tween(CHECK_DRAW_MILLIS, easing = FastOutSlowInEasing),
        label = "checkDraw",
    )
    // Rebond de la case au moment où l'on coche, sur le même instant que l'haptique ; jamais au
    // premier affichage d'une case déjà cochée. « Supprimer les animations » le rend nul.
    val pop = remember { Animatable(1f) }
    val scope = rememberCoroutineScope()
    Box(
        modifier
            .size(Size.touch)
            .toggleable(
                value = checked,
                interactionSource = remember { MutableInteractionSource() },
                indication = LocalIndication.current,
                role = Role.Checkbox,
                onValueChange = {
                    if (it) {
                        haptic.confirm()
                        scope.launch { pop.animateTo(1f, PopSpring, initialVelocity = POP_VELOCITY) }
                    } else {
                        haptic.tap()
                    }
                    onCheckedChange(it)
                },
            )
            .semantics {
                contentDescription?.let { this.contentDescription = it }
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(Size.checkbox)
                .graphicsLayer {
                    scaleX = pop.value
                    scaleY = pop.value
                }
                .clip(shape)
                .background(fillColor)
                .border(Size.stroke, strokeColor, shape),
            contentAlignment = Alignment.Center,
        ) {
            CheckMark(progress = drawProgress, color = mark)
        }
    }
}

private const val CHECK_DRAW_MILLIS = 220

/** Ressort de pression du style maison (amorti 0,5, raideur moyenne) : un rebond bref et net. */
private val PopSpring = spring<Float>(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium)

/** Élan initial du rebond : la case grandit d'environ 10 % avant de revenir. */
private const val POP_VELOCITY = 6f

/** Coche tracée trait après trait : [progress] va de 0 (rien) à 1 (coche complète). */
@Composable
private fun CheckMark(progress: Float, color: Color) {
    Canvas(Modifier.size(Size.iconSm)) {
        if (progress <= 0f) return@Canvas
        val path = Path().apply {
            moveTo(size.width * 0.18f, size.height * 0.52f)
            lineTo(size.width * 0.42f, size.height * 0.74f)
            lineTo(size.width * 0.82f, size.height * 0.28f)
        }
        val measure = PathMeasure().apply { setPath(path, false) }
        val visible = Path()
        measure.getSegment(0f, measure.length * progress, visible, true)
        drawPath(visible, color, style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
}
