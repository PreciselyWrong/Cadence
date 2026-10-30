package ch.nicolab.cadence.designsystem.components

import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import ch.nicolab.cadence.designsystem.R
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.cadence

/** Marque Cadence monochrome : le trait prend la teinte demandée. */
@Composable
fun BrandMark(
    modifier: Modifier = Modifier,
    size: Dp = Size.iconLarge,
    tint: Color = cadence.primary,
) {
    Icon(
        painter = painterResource(R.drawable.ic_widget_mark),
        contentDescription = null,
        modifier = modifier.size(size),
        tint = tint,
    )
}
