package ch.nicolab.cadence.designsystem.theme

import kotlin.math.abs
import kotlin.math.pow
import kotlin.math.roundToInt

/** Couleurs d'accent proposées dans Réglages › Apparence. */
enum class AccentPreset(val id: String, val argb: Int) {
    VIOLET("violet", 0xFF5E5CE6.toInt()),
    INDIGO("indigo", 0xFF3F51B5.toInt()),
    BLEU("bleu", 0xFF1E6FD9.toInt()),
    SARCELLE("sarcelle", 0xFF00897B.toInt()),
    VERT("vert", 0xFF2E7D32.toInt()),
    AMBRE("ambre", 0xFFC77700.toInt()),
    CORAIL("corail", 0xFFE0483B.toInt()),
    ROSE("rose", 0xFFC2185B.toInt()),
}

/** Rôles d'accent dérivés d'une couleur source, en ARGB. */
data class AccentRoles(
    val primary: Int,
    val onPrimary: Int,
    val primaryContainer: Int,
    val onPrimaryContainer: Int,
)

private const val WHITE = 0xFFFFFFFF.toInt()
private const val INK = 0xFF1B1B21.toInt()

private val VioletLight = AccentRoles(
    primary = 0xFF5E5CE6.toInt(),
    onPrimary = 0xFFFFFFFF.toInt(),
    primaryContainer = 0xFFE4E3FF.toInt(),
    onPrimaryContainer = 0xFF16136B.toInt(),
)

private val VioletDark = AccentRoles(
    primary = 0xFFA9A6FF.toInt(),
    onPrimary = 0xFF1B1680.toInt(),
    primaryContainer = 0xFF3A378F.toInt(),
    onPrimaryContainer = 0xFFE4E3FF.toInt(),
)

/**
 * Dérive les rôles d'accent depuis une couleur source.
 *
 * Le violet par défaut garde ses valeurs exactes du design : ses conteneurs ne suivent pas la
 * lightness de la règle générale. Les autres couleurs suivent la règle HSL, pour que chaque
 * accent ait le même poids visuel.
 */
fun deriveAccentRoles(seedArgb: Int, dark: Boolean): AccentRoles {
    if (seedArgb == AccentPreset.VIOLET.argb) return if (dark) VioletDark else VioletLight

    val seed = seedArgb.toHsl()
    fun tone(lightness: Float) = hslToArgb(seed.hue, seed.saturation, lightness)

    return if (dark) {
        AccentRoles(
            primary = tone(0.82f),
            onPrimary = tone(0.22f),
            primaryContainer = tone(0.30f),
            onPrimaryContainer = tone(0.90f),
        )
    } else {
        // Le texte sur l'accent prend l'encre la plus contrastée : blanc ou #1B1B21.
        val onPrimary = if (contrastRatio(seedArgb, WHITE) >= contrastRatio(seedArgb, INK)) WHITE else INK
        AccentRoles(
            primary = seedArgb,
            onPrimary = onPrimary,
            primaryContainer = tone(0.92f),
            onPrimaryContainer = tone(0.20f),
        )
    }
}

/** Ratio de contraste WCAG entre deux couleurs ARGB, de 1 à 21. */
fun contrastRatio(a: Int, b: Int): Double {
    val la = relativeLuminance(a)
    val lb = relativeLuminance(b)
    return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
}

fun accentPresetOf(id: String): AccentPreset? = AccentPreset.entries.firstOrNull { it.id == id }

internal data class Hsl(val hue: Float, val saturation: Float, val lightness: Float)

internal fun Int.toHsl(): Hsl {
    val r = ((this shr 16) and 0xFF) / 255f
    val g = ((this shr 8) and 0xFF) / 255f
    val b = (this and 0xFF) / 255f
    val max = maxOf(r, g, b)
    val min = minOf(r, g, b)
    val lightness = (max + min) / 2f
    val delta = max - min
    if (delta == 0f) return Hsl(0f, 0f, lightness)

    val saturation = delta / (1f - abs(2f * lightness - 1f))
    val sector = when (max) {
        r -> ((g - b) / delta + 6f) % 6f
        g -> (b - r) / delta + 2f
        else -> (r - g) / delta + 4f
    }
    return Hsl(sector * 60f, saturation, lightness)
}

internal fun hslToArgb(hue: Float, saturation: Float, lightness: Float): Int {
    val chroma = (1f - abs(2f * lightness - 1f)) * saturation
    val sector = hue / 60f
    val x = chroma * (1f - abs(sector % 2f - 1f))
    val (r1, g1, b1) = when {
        sector < 1f -> Triple(chroma, x, 0f)
        sector < 2f -> Triple(x, chroma, 0f)
        sector < 3f -> Triple(0f, chroma, x)
        sector < 4f -> Triple(0f, x, chroma)
        sector < 5f -> Triple(x, 0f, chroma)
        else -> Triple(chroma, 0f, x)
    }
    val m = lightness - chroma / 2f
    fun channel(value: Float) = ((value + m) * 255f).roundToInt().coerceIn(0, 255)
    return (0xFF shl 24) or (channel(r1) shl 16) or (channel(g1) shl 8) or channel(b1)
}

private fun relativeLuminance(argb: Int): Double {
    fun linear(channel: Int): Double {
        val c = channel / 255.0
        return if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
    }
    return 0.2126 * linear((argb shr 16) and 0xFF) +
        0.7152 * linear((argb shr 8) and 0xFF) +
        0.0722 * linear(argb and 0xFF)
}
