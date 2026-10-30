package ch.nicolab.cadence.designsystem.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.cadence

/**
 * Interrupteur de Cadence : piste primaire quand il est actif, icône dans le pouce pour
 * rendre l'état lisible sans couleur seule.
 */
@Composable
fun CadenceSwitch(
    checked: Boolean,
    onCheckedChange: ((Boolean) -> Unit)?,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    accent: Color? = null,
) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    val fill = accent ?: palette.primary
    Switch(
        checked = checked,
        onCheckedChange = onCheckedChange?.let { change ->
            { value: Boolean ->
                haptic.tap()
                change(value)
            }
        },
        modifier = modifier,
        enabled = enabled,
        colors = SwitchDefaults.colors(
            checkedTrackColor = fill,
            checkedThumbColor = onColorOf(fill),
            checkedBorderColor = Color.Transparent,
            uncheckedTrackColor = palette.containerHigh,
            uncheckedBorderColor = palette.outline,
            uncheckedThumbColor = palette.outline,
        ),
        thumbContent = {
            Icon(
                if (checked) Icons.Rounded.Check else Icons.Rounded.Close,
                null,
                tint = if (checked) fill else palette.containerHigh,
                modifier = Modifier.size(Size.iconSm),
            )
        },
    )
}
