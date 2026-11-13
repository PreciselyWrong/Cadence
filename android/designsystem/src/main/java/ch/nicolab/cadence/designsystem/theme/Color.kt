package ch.nicolab.cadence.designsystem.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Anciennes couleurs par défaut de l'accent, encore stockées dans les habitudes créées avant
 * la refonte : elles prennent l'accent courant du thème au lieu d'une teinte figée.
 */
private val LegacyDefaultAccentArgb = setOf(0xFF5E5CE6.toInt(), 0xFFA9A6FF.toInt(), 0xFF7D7AFF.toInt())

fun CadencePalette.habitAccent(colorArgb: Int?): Color =
    if (colorArgb == null || colorArgb in LegacyDefaultAccentArgb) primary else Color(colorArgb)

/** Rôles de la palette Cadence : surfaces, encres, accent et états sémantiques. */
@Immutable
data class CadencePalette(
    val primary: Color,
    val onPrimary: Color,
    val primaryContainer: Color,
    val onPrimaryContainer: Color,
    /** Fond général de l'écran. */
    val background: Color,
    /** Surface des grandes zones fonctionnelles, identique au fond. */
    val surface: Color,
    val onSurface: Color,
    val surfaceVariant: Color,
    val onSurfaceVariant: Color,
    /** Lignes et cartes posées sur le fond. */
    val card: Color,
    val containerLow: Color,
    val containerHigh: Color,
    val containerHighest: Color,
    val outline: Color,
    val outlineVariant: Color,
    val error: Color,
    val onError: Color,
    val errorContainer: Color,
    val onErrorContainer: Color,
    val success: Color,
    val successContainer: Color,
    val warning: Color,
    val warningContainer: Color,
    /** Information douce (priorité basse) : bleu ardoise, encre sur son conteneur à plus de 4,5:1. */
    val info: Color,
    val infoContainer: Color,
    /** Horizon (semaine, mois, un jour) sans date précise : violet doux, distinct de l'accent. */
    val horizon: Color,
    val horizonContainer: Color,
    /** Voile sous les feuilles modales. */
    val scrim: Color,
    val isDark: Boolean,
)

val LightPalette = CadencePalette(
    primary = Color(0xFF5E5CE6),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFE4E3FF),
    onPrimaryContainer = Color(0xFF16136B),
    background = Color(0xFFFCFCFD),
    surface = Color(0xFFFCFCFD),
    onSurface = Color(0xFF1B1B21),
    surfaceVariant = Color(0xFFE4E1EC),
    onSurfaceVariant = Color(0xFF46464F),
    // Fonds neutres (refonte 2026-11) : la couleur vient du projet et de l'accent, jamais des surfaces.
    card = Color(0xFFF4F4F6),
    containerLow = Color(0xFFF6F6F8),
    containerHigh = Color(0xFFEBEBEE),
    containerHighest = Color(0xFFE4E4E8),
    // Sert aussi de texte secondaire : 4,5:1 jusque sur `containerHigh`.
    outline = Color(0xFF66656F),
    outlineVariant = Color(0xFFC7C5D0),
    error = Color(0xFFBA1A1A),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF410002),
    success = Color(0xFF286C2A),
    successContainer = Color(0xFFABF5A3),
    warning = Color(0xFF7C5800),
    warningContainer = Color(0xFFFFDEA8),
    info = Color(0xFF2F4A73),
    infoContainer = Color(0xFFDCE6F5),
    horizon = Color(0xFF6A2FA8),
    horizonContainer = Color(0xFFEFE3FB),
    scrim = Color(0xFF0E0E14),
    isDark = false,
)

val DarkPalette = CadencePalette(
    primary = Color(0xFFA9A6FF),
    onPrimary = Color(0xFF1B1680),
    primaryContainer = Color(0xFF3A378F),
    onPrimaryContainer = Color(0xFFE4E3FF),
    background = Color(0xFF121214),
    surface = Color(0xFF121214),
    onSurface = Color(0xFFE5E1EC),
    surfaceVariant = Color(0xFF46454F),
    onSurfaceVariant = Color(0xFFC8C5D0),
    card = Color(0xFF1E1E21),
    containerLow = Color(0xFF1A1A1D),
    containerHigh = Color(0xFF28282C),
    containerHighest = Color(0xFF343438),
    outline = Color(0xFF918F9A),
    outlineVariant = Color(0xFF46454F),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
    errorContainer = Color(0xFF93000A),
    onErrorContainer = Color(0xFFFFDAD6),
    success = Color(0xFF8FD88A),
    successContainer = Color(0xFF1F5223),
    warning = Color(0xFFF5BD52),
    warningContainer = Color(0xFF5D4200),
    info = Color(0xFFB5CBEE),
    infoContainer = Color(0xFF2A3A55),
    horizon = Color(0xFFD8BFF8),
    horizonContainer = Color(0xFF45306A),
    scrim = Color(0xFF000000),
    isDark = true,
)

/** Noir pur : fonds absolus pour les écrans OLED, les autres rôles restent ceux du sombre. */
val PureBlackPalette = DarkPalette.copy(
    background = Color(0xFF000000),
    surface = Color(0xFF000000),
    card = Color(0xFF121216),
    containerLow = Color(0xFF0A0A0E),
    containerHigh = Color(0xFF1C1C22),
    containerHighest = Color(0xFF26262C),
    // Sur du noir pur, les libellés discrets et les filets restent nets (filets : 3:1, WCAG 1.4.11).
    outline = Color(0xFFA8A6B1),
    outlineVariant = Color(0xFF6E6D78),
)

/** Fond translucide des boutons et puces inactifs. */
val CadencePalette.glass: Color
    get() = surfaceVariant.copy(alpha = if (isDark) 0.35f else 0.60f)

val CadencePalette.glassBorder: Color
    get() = outline.copy(alpha = 0.35f)

val CadencePalette.glassSelected: Color
    get() = primaryContainer.copy(alpha = if (isDark) 0.55f else 0.72f)

val CadencePalette.glassSelectedBorder: Color
    get() = primary.copy(alpha = 0.45f)

val LocalCadencePalette = staticCompositionLocalOf { LightPalette }
