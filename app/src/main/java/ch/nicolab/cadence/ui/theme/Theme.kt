package ch.nicolab.cadence.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFF8EACFF),
    onPrimary = Color(0xFF071A45),
    primaryContainer = Color(0xFF233C76),
    onPrimaryContainer = Color(0xFFDCE5FF),
    secondary = Color(0xFF62DBC8),
    secondaryContainer = Color(0xFF0C4F47),
    tertiary = Color(0xFFFF8F9A),
    tertiaryContainer = Color(0xFF6B2630),
    background = Color(0xFF0C1020),
    onBackground = Color(0xFFF0F1FA),
    surface = Color(0xFF151A2D),
    onSurface = Color(0xFFF0F1FA),
    surfaceVariant = Color(0xFF252C45),
    onSurfaceVariant = Color(0xFFC5CAE0)
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
    darkTheme: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
