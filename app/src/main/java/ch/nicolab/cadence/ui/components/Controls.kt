package ch.nicolab.cadence.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
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
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import ch.nicolab.cadence.ui.theme.Motion
import ch.nicolab.cadence.ui.theme.Radius
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence

/** Action principale. Accent plein, cible tactile confortable. */
@Composable
fun PrimaryAction(
    label: String,
    modifier: Modifier = Modifier,
    accent: Color? = null,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val palette = cadence
    val fill = accent ?: palette.accent
    val container = if (enabled) fill else palette.sunken
    val content = if (enabled) onColorOf(fill) else palette.inkMuted
    Box(
        modifier
            .heightIn(min = Size.control)
            .clip(Radius.Control)
            .background(container)
            .clickable(enabled = enabled, onClick = onClick)
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
    Box(
        modifier
            .heightIn(min = Size.control)
            .clip(Radius.Control)
            .background(palette.sunken)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = Space.xl),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = if (enabled) palette.ink else palette.inkFaint)
    }
}

/** Action tertiaire : texte, mais avec une cible tactile complète. */
@Composable
fun TertiaryAction(
    label: String,
    modifier: Modifier = Modifier,
    tint: Color? = null,
    onClick: () -> Unit,
) = Box(
    modifier.heightIn(min = Size.touch).clip(Radius.Control).clickable(onClick = onClick).padding(horizontal = Space.lg),
    contentAlignment = Alignment.Center,
) {
    Text(label, style = MaterialTheme.typography.labelLarge, color = tint ?: cadence.inkMuted)
}

/** Action réellement destructive, et rien d'autre. */
@Composable
fun DestructiveAction(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) =
    PrimaryAction(label, modifier, accent = cadence.danger, onClick = onClick)

/**
 * Puce de sélection. L'état actif est porté par la surface accentuée, pas par une bordure,
 * et la géométrie se resserre légèrement lorsqu'elle est choisie.
 */
@Composable
fun ChoiceChip(
    label: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    accent: Color? = null,
    onClick: () -> Unit,
) {
    val palette = cadence
    val fill = accent ?: palette.accent
    val container by animateColorAsState(if (selected) fill else palette.sunken, Motion.quick(), label = "chip")
    val content by animateColorAsState(if (selected) onColorOf(fill) else palette.ink, Motion.quick(), label = "chipText")
    Box(
        modifier
            .clip(Radius.Chip)
            .background(container)
            .clickable(onClick = onClick)
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
    val fill = accent ?: palette.accent
    Box(
        modifier
            .clip(Radius.Chip)
            .background(fill.copy(alpha = if (palette.isDark) 0.24f else 0.14f))
            .clickable(onClick = onClick)
            .defaultMinSize(minHeight = 44.dp)
            .padding(horizontal = Space.lg, vertical = Space.md),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = palette.ink)
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
    val fill = accent ?: palette.accent
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val resting = if (accent == null) palette.sunken else fill.copy(alpha = if (palette.isDark) 0.12f else 0.07f)
    val container by animateColorAsState(if (focused) fill.copy(alpha = 0.16f) else resting, Motion.quick(), label = "field")
    Column(modifier.fillMaxWidth()) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = if (focused) fill else palette.inkFaint)
        Spacer(Modifier.height(Space.xs))
        Row(
            Modifier.fillMaxWidth().clip(Radius.Control).background(container).padding(horizontal = Space.lg).heightIn(min = Size.control),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.weight(1f)) {
                if (value.isEmpty() && placeholder != null) {
                    Text(placeholder, style = MaterialTheme.typography.bodyLarge, color = palette.inkFaint)
                }
                BasicTextField(
                    value = value,
                    onValueChange = onValue,
                    singleLine = true,
                    interactionSource = interaction,
                    textStyle = LocalTextStyle.current.merge(MaterialTheme.typography.bodyLarge).copy(color = palette.ink),
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
                Text(it, style = MaterialTheme.typography.bodySmall, color = palette.inkFaint)
            }
        }
        support?.let {
            Spacer(Modifier.height(Space.xs))
            Text(it, style = MaterialTheme.typography.bodySmall, color = palette.inkFaint)
        }
    }
}

/** Ligne interrupteur, alignée sur le rythme des autres contrôles. */
@Composable
fun ToggleRow(label: String, checked: Boolean, accent: Color? = null, onChecked: (Boolean) -> Unit) {
    val palette = cadence
    val fill = accent ?: palette.accent
    Row(
        Modifier.fillMaxWidth().clip(Radius.Control).clickable { onChecked(!checked) }.heightIn(min = Size.touch),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge, color = palette.ink)
        Switch(
            checked,
            onChecked,
            colors = SwitchDefaults.colors(
                checkedThumbColor = onColorOf(fill),
                checkedTrackColor = fill,
                uncheckedThumbColor = palette.surface,
                uncheckedTrackColor = palette.hairline,
                uncheckedBorderColor = Color.Transparent,
            ),
        )
    }
}

/** Ligne d'action d'un modal : pleine largeur, pastille colorée, libellé lisible. */
@Composable
fun ActionRow(icon: ImageVector, label: String, tint: Color, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(Radius.Control).clickable(onClick = onClick).heightIn(min = Size.touch).padding(horizontal = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(36.dp).clip(Radius.Chip).background(tint.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(Size.icon))
        }
        Spacer(Modifier.width(Space.md))
        Text(label, style = MaterialTheme.typography.bodyLarge, color = cadence.ink)
    }
}

/** Groupe de choix : un libellé, puis une grille de puces. */
@Composable
fun FieldGroup(label: String, content: @Composable () -> Unit) = Column {
    Text(label, style = MaterialTheme.typography.labelMedium, color = cadence.inkFaint)
    Spacer(Modifier.height(Space.sm))
    content()
}

/** Message d'erreur de formulaire, toujours au même endroit et toujours lisible. */
@Composable
fun ErrorText(message: String, modifier: Modifier = Modifier) = Row(
    modifier.fillMaxWidth().clip(Radius.Chip).background(cadence.danger.copy(alpha = 0.12f)).padding(Space.md),
    verticalAlignment = Alignment.CenterVertically,
) {
    Text(message, style = MaterialTheme.typography.bodySmall, color = cadence.danger)
}

/** Contraste garanti sur une surface accentuée, y compris pour une couleur d'habitude claire. */
@Composable
fun onColorOf(background: Color): Color {
    val palette = cadence
    val luminance = 0.299f * background.red + 0.587f * background.green + 0.114f * background.blue
    return if (luminance > 0.62f) palette.ink else Color.White
}

@Composable
internal fun DisabledContent(enabled: Boolean, content: @Composable () -> Unit) =
    Box(Modifier.alpha(if (enabled) 1f else 0.55f)) { content() }

@Composable
internal fun ActionsRow(content: @Composable () -> Unit) =
    Row(Modifier.fillMaxWidth().height(Size.control), horizontalArrangement = Arrangement.spacedBy(Space.md)) { content() }
