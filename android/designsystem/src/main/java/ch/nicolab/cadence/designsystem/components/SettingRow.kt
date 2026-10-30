package ch.nicolab.cadence.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence

/**
 * Ligne de réglage : icône teintée, titre, sous-titre facultatif, puis valeur ou chevron
 * lorsque la ligne est cliquable.
 */
@Composable
fun SettingRow(
    title: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    subtitle: String? = null,
    shape: Shape = Radius.Card,
    trailing: (@Composable () -> Unit)? = null,
    onClick: (() -> Unit)? = null,
) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    val clickable = if (onClick != null) {
        Modifier.clickable(role = Role.Button) {
            haptic.tap()
            onClick()
        }
    } else {
        Modifier
    }
    Row(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(palette.card)
            .then(clickable)
            .heightIn(min = Size.settingRow)
            .padding(horizontal = Space.lg, vertical = Space.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        icon?.let {
            Icon(it, null, tint = palette.primary, modifier = Modifier.size(Size.iconLarge))
            Spacer(Modifier.width(Space.lg))
        }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, color = palette.onSurface)
            subtitle?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
            }
        }
        if (trailing != null) {
            trailing()
        } else if (onClick != null) {
            Icon(
                Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                null,
                tint = palette.onSurfaceVariant,
                modifier = Modifier.size(Size.icon),
            )
        }
    }
}

/** Ligne de réglage à interrupteur : toute la ligne bascule la valeur. */
@Composable
fun SettingToggleRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    subtitle: String? = null,
    shape: Shape = Radius.Card,
    enabled: Boolean = true,
) {
    SettingRow(
        title = title,
        modifier = modifier,
        icon = icon,
        subtitle = subtitle,
        shape = shape,
        trailing = { CadenceSwitch(checked, onCheckedChange, enabled = enabled) },
        onClick = if (enabled) {
            { onCheckedChange(!checked) }
        } else {
            null
        },
    )
}
