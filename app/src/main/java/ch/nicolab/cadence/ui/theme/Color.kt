package ch.nicolab.cadence.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb

fun CadencePalette.habitAccent(colorArgb: Int?): Color =
    if (colorArgb == null || colorArgb == LightPalette.accent.toArgb() || colorArgb == DarkPalette.accent.toArgb()) accent
    else Color(colorArgb)

/**
 * Palette de Cadence : sobriété Apple-native, contrastes de surfaces nets,
 * encres franches et accent Indigo électrique employé avec parcimonie.
 */
@Immutable
data class CadencePalette(
    /** Niveau 1 - fond général, blanc cassé propre ou noir absolu. */
    val background: Color,
    /** Niveau 2 - grandes surfaces fonctionnelles. */
    val surface: Color,
    /** Niveau 2 creusé - zone intérieure d'une surface (champ, jauge, piste). */
    val sunken: Color,
    /** Surface sombre structurante - navigation et contextes forts. */
    val structural: Color,
    val onStructural: Color,
    val onStructuralMuted: Color,
    /** Niveau 3 - accent principal, réservé aux éléments interactifs et aux états actifs. */
    val accent: Color,
    val onAccent: Color,
    val accentSoft: Color,
    val ink: Color,
    val inkMuted: Color,
    val inkFaint: Color,
    val hairline: Color,
    val success: Color,
    val successSoft: Color,
    val warning: Color,
    val danger: Color,
    val isDark: Boolean,
)

val LightPalette = CadencePalette(
    background = Color(0xFFF2F2F7),
    surface = Color(0xFFFFFFFF),
    sunken = Color(0xFFE5E5EA),
    structural = Color(0xFF1C1C1E),
    onStructural = Color(0xFFF2F2F7),
    onStructuralMuted = Color(0xFF8E8E93),
    accent = Color(0xFF5E5CE6),
    onAccent = Color(0xFFFFFFFF),
    accentSoft = Color(0xFFEBEBF5),
    ink = Color(0xFF000000),
    inkMuted = Color(0xFF636366),
    inkFaint = Color(0xFF8E8E93),
    hairline = Color(0xFFE5E5EA),
    success = Color(0xFF34C759),
    successSoft = Color(0xFFE8F9ED),
    warning = Color(0xFFFF9500),
    danger = Color(0xFFFF3B30),
    isDark = false,
)

val DarkPalette = CadencePalette(
    background = Color(0xFF000000),
    surface = Color(0xFF1C1C1E),
    sunken = Color(0xFF2C2C2E),
    structural = Color(0xFF2C2C2E),
    onStructural = Color(0xFFFFFFFF),
    onStructuralMuted = Color(0xFF8E8E93),
    accent = Color(0xFF7D7AFF),
    onAccent = Color(0xFF000000),
    accentSoft = Color(0xFF2C2C3E),
    ink = Color(0xFFFFFFFF),
    inkMuted = Color(0xFF8E8E93),
    inkFaint = Color(0xFF636366),
    hairline = Color(0xFF38383A),
    success = Color(0xFF30D158),
    successSoft = Color(0xFF13381E),
    warning = Color(0xFFFF9F0A),
    danger = Color(0xFFFF453A),
    isDark = true,
)

val LocalCadencePalette = staticCompositionLocalOf { LightPalette }
