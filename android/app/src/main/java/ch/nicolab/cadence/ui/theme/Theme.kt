package ch.nicolab.cadence.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider

private fun schemeOf(palette: CadencePalette) = if (palette.isDark) {
    darkColorScheme(
        primary = palette.accent,
        onPrimary = palette.onAccent,
        primaryContainer = palette.accentSoft,
        onPrimaryContainer = palette.ink,
        secondary = palette.inkMuted,
        secondaryContainer = palette.sunken,
        onSecondaryContainer = palette.ink,
        tertiary = palette.warning,
        background = palette.background,
        onBackground = palette.ink,
        surface = palette.surface,
        onSurface = palette.ink,
        surfaceVariant = palette.sunken,
        onSurfaceVariant = palette.inkMuted,
        outline = palette.inkFaint,
        outlineVariant = palette.hairline,
        error = palette.danger,
        onError = palette.onAccent,
    )
} else {
    lightColorScheme(
        primary = palette.accent,
        onPrimary = palette.onAccent,
        primaryContainer = palette.accentSoft,
        onPrimaryContainer = palette.ink,
        secondary = palette.inkMuted,
        secondaryContainer = palette.sunken,
        onSecondaryContainer = palette.ink,
        tertiary = palette.warning,
        background = palette.background,
        onBackground = palette.ink,
        surface = palette.surface,
        onSurface = palette.ink,
        surfaceVariant = palette.sunken,
        onSurfaceVariant = palette.inkMuted,
        outline = palette.inkFaint,
        outlineVariant = palette.hairline,
        error = palette.danger,
        onError = palette.onAccent,
    )
}

@Composable
fun CadenceTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val palette = if (darkTheme) DarkPalette else LightPalette
    CompositionLocalProvider(LocalCadencePalette provides palette) {
        MaterialTheme(
            colorScheme = schemeOf(palette),
            typography = Typography,
            content = content,
        )
    }
}

/** Accès direct à la palette Cadence depuis n'importe quel composable du thème. */
val cadence: CadencePalette
    @Composable get() = LocalCadencePalette.current
