package ch.nicolab.cadence.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb

fun CadencePalette.habitAccent(colorArgb: Int?): Color =
    if (colorArgb == null || colorArgb == LightPalette.accent.toArgb() || colorArgb == DarkPalette.accent.toArgb()) accent
    else Color(colorArgb)

/**
 * Palette de Cadence : un fond très calme, une surface claire, une surface sombre
 * structurante pour la navigation, et un accent indigo électrique employé avec parcimonie.
 */
@Immutable
data class CadencePalette(
    /** Niveau 1 - fond général, jamais blanc pur en clair. */
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
    background = Color(0xFFF2F3F8),
    surface = Color(0xFFFFFFFF),
    sunken = Color(0xFFE7EAF4),
    structural = Color(0xFF161A28),
    onStructural = Color(0xFFF4F5FA),
    onStructuralMuted = Color(0xFF9AA1BC),
    accent = Color(0xFF5546EE),
    onAccent = Color(0xFFFFFFFF),
    accentSoft = Color(0xFFE6E3FF),
    ink = Color(0xFF121524),
    inkMuted = Color(0xFF525870),
    inkFaint = Color(0xFF6B728D),
    hairline = Color(0xFFD7DCE9),
    success = Color(0xFF1B9C6B),
    successSoft = Color(0xFFD8F2E7),
    warning = Color(0xFFC77C0A),
    danger = Color(0xFFD93C4E),
    isDark = false,
)

val DarkPalette = CadencePalette(
    background = Color(0xFF0B0D16),
    surface = Color(0xFF161A28),
    sunken = Color(0xFF272E42),
    structural = Color(0xFF1C2130),
    onStructural = Color(0xFFF0F2FA),
    onStructuralMuted = Color(0xFF8A92AC),
    accent = Color(0xFF8B7BFF),
    onAccent = Color(0xFF120C3A),
    accentSoft = Color(0xFF2A2857),
    ink = Color(0xFFEEF0F8),
    inkMuted = Color(0xFFAEB8D4),
    inkFaint = Color(0xFF8E97B4),
    hairline = Color(0xFF39415A),
    success = Color(0xFF4CD39A),
    successSoft = Color(0xFF183D32),
    warning = Color(0xFFE7A93C),
    danger = Color(0xFFFF6B7B),
    isDark = true,
)

val LocalCadencePalette = staticCompositionLocalOf { LightPalette }
