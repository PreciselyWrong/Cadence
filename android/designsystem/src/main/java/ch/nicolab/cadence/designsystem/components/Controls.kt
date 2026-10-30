package ch.nicolab.cadence.designsystem.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.theme.Motion
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence

/** Action principale. Accent plein, cible tactile confortable et compression physique au toucher. */
@Composable
fun PrimaryAction(
    label: String,
    modifier: Modifier = Modifier,
    accent: Color? = null,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val palette = cadence
    val fill = accent ?: palette.primary
    val container = if (enabled) fill else palette.containerHigh
    val content = if (enabled) onColorOf(fill) else palette.onSurfaceVariant
    val haptic = rememberCadenceHaptic()
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed && enabled) 0.97f else 1f,
        animationSpec = Motion.interactive(),
        label = "primaryActionPress",
    )
    Box(
        modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .heightIn(min = Size.control)
            .clip(Radius.Control)
            .background(container)
            .clickable(
                interactionSource = interactionSource,
                indication = androidx.compose.foundation.LocalIndication.current,
                enabled = enabled,
                onClick = {
                    haptic.confirm()
                    onClick()
                },
            )
            .padding(horizontal = Space.xl),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = content, textAlign = TextAlign.Center)
    }
}

/** Action secondaire : surface neutre, aucun contour marqué. */
@Composable
fun SecondaryAction(
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed && enabled) 0.97f else 1f,
        animationSpec = Motion.interactive(),
        label = "secondaryActionPress",
    )
    Box(
        modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .heightIn(min = Size.control)
            .clip(Radius.Control)
            .background(palette.containerHigh)
            .clickable(
                interactionSource = interactionSource,
                indication = androidx.compose.foundation.LocalIndication.current,
                enabled = enabled,
                onClick = {
                    haptic.tap()
                    onClick()
                },
            )
            .padding(horizontal = Space.xl),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = if (enabled) palette.onSurface else palette.outline)
    }
}

/** Action tertiaire : texte, mais avec une cible tactile complète et retour physique. */
@Composable
fun TertiaryAction(
    label: String,
    modifier: Modifier = Modifier,
    tint: Color? = null,
    onClick: () -> Unit,
) {
    val haptic = rememberCadenceHaptic()
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.96f else 1f,
        animationSpec = Motion.interactive(),
        label = "tertiaryActionPress",
    )
    Box(
        modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .heightIn(min = Size.touch)
            .clip(Radius.Control)
            .clickable(
                interactionSource = interactionSource,
                indication = androidx.compose.foundation.LocalIndication.current,
                onClick = {
                    haptic.tap()
                    onClick()
                },
            )
            .padding(horizontal = Space.lg),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = tint ?: cadence.primary)
    }
}

/** Puce sélectionnable avec retour tactile et transition douce. */
@Composable
fun ChoiceChip(
    label: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    accent: Color? = null,
    onClick: () -> Unit,
) {
    val palette = cadence
    val fill = accent ?: palette.primary
    val haptic = rememberCadenceHaptic()
    val container by animateColorAsState(if (selected) fill else palette.containerHigh, Motion.quick(), label = "chip")
    val content by animateColorAsState(if (selected) onColorOf(fill) else palette.onSurface, Motion.quick(), label = "chipText")
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.95f else 1f,
        animationSpec = Motion.interactive(),
        label = "choiceChipPress",
    )
    Box(
        modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .clip(Radius.Chip)
            .background(container)
            .clickable(
                interactionSource = interactionSource,
                indication = androidx.compose.foundation.LocalIndication.current,
                onClick = {
                    haptic.tap()
                    onClick()
                },
            )
            .defaultMinSize(minHeight = 40.dp)
            .padding(horizontal = Space.lg, vertical = Space.md),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = content)
    }
}

/**
 * Puce d'incrément : action rapide de saisie. Surface doucement teintée avec texte net.
 */
@Composable
fun ValueChip(label: String, accent: Color? = null, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val palette = cadence
    val fill = accent ?: palette.primary
    val haptic = rememberCadenceHaptic()
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.94f else 1f,
        animationSpec = Motion.interactive(),
        label = "valueChipPress",
    )
    Box(
        modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .clip(Radius.Chip)
            .background(fill.copy(alpha = if (palette.isDark) 0.24f else 0.14f))
            .clickable(
                interactionSource = interactionSource,
                indication = androidx.compose.foundation.LocalIndication.current,
                onClick = {
                    haptic.tap()
                    onClick()
                },
            )
            .defaultMinSize(minHeight = 44.dp)
            .padding(horizontal = Space.lg, vertical = Space.md),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = palette.onSurface)
    }
}

/**
 * Champ de saisie : fond creusé, grand rayon, libellé au-dessus, halo de focus discret.
 * Aucune bordure épaisse, aucun contour fluorescent.
 */
@Composable
fun CadenceField(
    value: String,
    onValue: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    support: String? = null,
    suffix: String? = null,
    accent: Color? = null,
    numeric: Boolean = false,
    decimal: Boolean = false,
) {
    val palette = cadence
    val fill = accent ?: palette.primary
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val resting = if (accent == null) palette.containerHigh else fill.copy(alpha = if (palette.isDark) 0.12f else 0.07f)
    val container by animateColorAsState(if (focused) fill.copy(alpha = 0.16f) else resting, Motion.quick(), label = "field")
    Column(modifier.fillMaxWidth()) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = if (focused) fill else palette.outline)
        Spacer(Modifier.height(Space.xs))
        Row(
            Modifier.fillMaxWidth().clip(Radius.Control).background(container).padding(horizontal = Space.lg).heightIn(min = Size.control),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.weight(1f)) {
                if (value.isEmpty() && placeholder != null) {
                    Text(placeholder, style = MaterialTheme.typography.bodyLarge, color = palette.outline)
                }
                BasicTextField(
                    value = value,
                    onValueChange = onValue,
                    singleLine = true,
                    interactionSource = interaction,
                    textStyle = LocalTextStyle.current.merge(MaterialTheme.typography.bodyLarge).copy(color = palette.onSurface),
                    cursorBrush = SolidColor(fill),
                    keyboardOptions = KeyboardOptions(keyboardType = when {
                        decimal -> KeyboardType.Decimal
                        numeric -> KeyboardType.Number
                        else -> KeyboardType.Text
                    }),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            suffix?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.width(Space.sm))
                Text(it, style = MaterialTheme.typography.bodySmall, color = palette.outline)
            }
        }
        support?.let {
            Spacer(Modifier.height(Space.xs))
            Text(it, style = MaterialTheme.typography.bodySmall, color = palette.outline)
        }
    }
}

/** Ligne interrupteur, alignée sur le rythme des autres contrôles avec retour haptique. */
@Composable
fun ToggleRow(label: String, checked: Boolean, accent: Color? = null, onChecked: (Boolean) -> Unit) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    Row(
        Modifier
            .fillMaxWidth()
            .clip(Radius.Control)
            .clickable {
                haptic.tap()
                onChecked(!checked)
            }
            .heightIn(min = Size.touch),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge, color = palette.onSurface)
        CadenceSwitch(checked, onChecked, accent = accent)
    }
}

/** Ligne d'action d'un modal : pleine largeur, pastille colorée, libellé lisible et retour physique. */
@Composable
fun ActionRow(icon: ImageVector, label: String, tint: Color, onClick: () -> Unit) {
    val haptic = rememberCadenceHaptic()
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.98f else 1f,
        animationSpec = Motion.interactive(),
        label = "actionRowPress",
    )
    Row(
        Modifier
            .fillMaxWidth()
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .clip(Radius.Control)
            .clickable(
                interactionSource = interactionSource,
                indication = androidx.compose.foundation.LocalIndication.current,
                onClick = {
                    haptic.tap()
                    onClick()
                },
            )
            .heightIn(min = Size.touch)
            .padding(horizontal = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(36.dp).clip(Radius.Chip).background(tint.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(Size.icon))
        }
        Spacer(Modifier.width(Space.md))
        Text(label, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface)
    }
}

/** Groupe de choix : un libellé, puis une grille de puces. */
@Composable
fun FieldGroup(label: String, content: @Composable () -> Unit) = Column {
    Text(label, style = MaterialTheme.typography.labelMedium, color = cadence.outline)
    Spacer(Modifier.height(Space.sm))
    content()
}

/** Message d'erreur de formulaire, toujours au même endroit et toujours lisible. */
@Composable
fun ErrorText(message: String, modifier: Modifier = Modifier) = Row(
    modifier.fillMaxWidth().clip(Radius.Chip).background(cadence.error.copy(alpha = 0.12f)).padding(Space.md),
    verticalAlignment = Alignment.CenterVertically,
) {
    Text(message, style = MaterialTheme.typography.bodySmall, color = cadence.error)
}

/** Contraste garanti sur une surface accentuée, y compris pour une couleur d'habitude claire. */
@Composable
fun onColorOf(background: Color): Color {
    val palette = cadence
    val luminance = 0.299f * background.red + 0.587f * background.green + 0.114f * background.blue
    return if (luminance > 0.62f) palette.onSurface else Color.White
}

@Composable
internal fun DisabledContent(enabled: Boolean, content: @Composable () -> Unit) =
    Box(Modifier.alpha(if (enabled) 1f else 0.55f)) { content() }

@Composable
internal fun ActionsRow(content: @Composable () -> Unit) =
    Row(Modifier.fillMaxWidth().height(Size.control), horizontalArrangement = Arrangement.spacedBy(Space.md)) { content() }
