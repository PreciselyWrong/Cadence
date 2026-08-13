package ch.nicolab.cadence.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = PeriwinkleSoft,
    onPrimary = Ink,
    primaryContainer = InkSoft,
    onPrimaryContainer = PeriwinkleSoft,
    background = Night,
    onBackground = NightMist,
    surface = NightSurface,
    onSurface = NightMist,
    surfaceVariant = InkSoft,
    onSurfaceVariant = Mist
)

private val LightColorScheme = lightColorScheme(
    primary = Periwinkle,
    onPrimary = Cloud,
    primaryContainer = PeriwinkleSoft,
    onPrimaryContainer = Ink,
    secondaryContainer = Mist,
    background = Cloud,
    onBackground = Ink,
    surface = Cloud,
    onSurface = Ink,
    surfaceVariant = Mist,
    onSurfaceVariant = InkSoft
)

@Composable
fun CadenceTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
