package ch.nicolab.cadence.designsystem.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
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
 * Interrupteur de Cadence : piste primaire quand il est actif, coche dans le pouce pour
 * rendre l'état lisible sans couleur seule ; éteint, le pouce reste nu.
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
        thumbContent = if (checked) {
            {
                Icon(Icons.Rounded.Check, null, tint = fill, modifier = Modifier.size(Size.iconSm))
            }
        } else {
            null
        },
    )
}
