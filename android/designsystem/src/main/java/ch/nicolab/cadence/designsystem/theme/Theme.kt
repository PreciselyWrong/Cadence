package ch.nicolab.cadence.designsystem.theme

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

@Composable
fun CadenceTheme(
    appearance: Appearance = rememberStoredAppearance(),
    content: @Composable () -> Unit,
) {
    val dark = when (appearance.themeMode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    val context = LocalContext.current
    val palette = remember(appearance, dark, context) {
        val base = when {
            !dark -> LightPalette
            appearance.pureBlack -> PureBlackPalette
            else -> DarkPalette
        }
        base.withAccent(appearance, dark, context)
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = view.context.findActivity()?.window ?: return@SideEffect
            val controller = WindowCompat.getInsetsController(window, view)
            controller.isAppearanceLightStatusBars = !dark
            controller.isAppearanceLightNavigationBars = !dark
        }
    }

    CompositionLocalProvider(LocalCadencePalette provides palette) {
        MaterialTheme(
            colorScheme = palette.toColorScheme(),
            typography = Typography,
            content = content,
        )
    }
}

/** Accès direct à la palette Cadence depuis n'importe quel composable du thème. */
val cadence: CadencePalette
    @Composable get() = LocalCadencePalette.current

private fun CadencePalette.withAccent(appearance: Appearance, dark: Boolean, context: Context): CadencePalette {
    if (appearance.materialYou && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val scheme = if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        return copy(
            primary = scheme.primary,
            onPrimary = scheme.onPrimary,
            primaryContainer = scheme.primaryContainer,
            onPrimaryContainer = scheme.onPrimaryContainer,
        )
    }
    val roles = deriveAccentRoles(appearance.accent.seedArgb, dark)
    return copy(
        primary = Color(roles.primary),
        onPrimary = Color(roles.onPrimary),
        primaryContainer = Color(roles.primaryContainer),
        onPrimaryContainer = Color(roles.onPrimaryContainer),
    )
}

/** Traduit la palette Cadence vers Material 3 : chaque rôle Material a un correspondant explicite. */
internal fun CadencePalette.toColorScheme(): ColorScheme {
    val base = if (isDark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = primary,
        onPrimary = onPrimary,
        primaryContainer = primaryContainer,
        onPrimaryContainer = onPrimaryContainer,
        inversePrimary = primaryContainer,
        secondary = primary,
        onSecondary = onPrimary,
        secondaryContainer = primaryContainer,
        onSecondaryContainer = onPrimaryContainer,
        tertiary = success,
        onTertiary = background,
        tertiaryContainer = successContainer,
        onTertiaryContainer = onSurface,
        background = background,
        onBackground = onSurface,
        surface = surface,
        onSurface = onSurface,
        surfaceVariant = surfaceVariant,
        onSurfaceVariant = onSurfaceVariant,
        surfaceTint = primary,
        surfaceBright = background,
        surfaceDim = containerHighest,
        surfaceContainerLowest = background,
        surfaceContainerLow = containerLow,
        surfaceContainer = card,
        // Dialogues et sélecteurs Material : posés sur la carte, où l'accent reste lisible à 4,5:1.
        surfaceContainerHigh = card,
        surfaceContainerHighest = containerHighest,
        inverseSurface = onSurface,
        inverseOnSurface = background,
        outline = outline,
        outlineVariant = outlineVariant,
        error = error,
        onError = onError,
        errorContainer = errorContainer,
        onErrorContainer = onErrorContainer,
        scrim = scrim,
    )
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
