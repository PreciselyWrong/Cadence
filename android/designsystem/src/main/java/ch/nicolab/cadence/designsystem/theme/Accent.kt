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

/** Carte claire (`LightPalette.card`), la surface claire la plus courante sous un texte d'accent. */
private const val LIGHT_CARD = 0xFFF3F1FC.toInt()

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
 * accent ait le même poids visuel, puis chaque paire texte/fond est ajustée jusqu'à 4,5:1.
 */
fun deriveAccentRoles(seedArgb: Int, dark: Boolean): AccentRoles {
    if (seedArgb == AccentPreset.VIOLET.argb) return if (dark) VioletDark else VioletLight

    val seed = seedArgb.toHsl()
    fun tone(lightness: Float) = hslToArgb(seed.hue, seed.saturation, lightness)

    return if (dark) {
        val primary = tone(0.82f)
        val onPrimaryContainer = tone(0.90f)
        AccentRoles(
            primary = primary,
            onPrimary = readableTint(tone(0.22f), primary),
            // Une teinte lumineuse (sarcelle, vert, jaune) à L 0,30 reste trop claire sous un texte
            // clair : le conteneur est assombri jusqu'à 4,5:1.
            primaryContainer = readableTint(tone(0.30f), onPrimaryContainer),
            onPrimaryContainer = onPrimaryContainer,
        )
    } else {
        // L'accent sert aussi de couleur de texte (liens, actions) : une source trop claire
        // (ambre, corail, couleur libre) est assombrie, teinte gardée, jusqu'à 4,5:1 sur les cartes.
        val primary = readableTint(seedArgb, LIGHT_CARD)
        val primaryContainer = tone(0.92f)
        AccentRoles(
            primary = primary,
            onPrimary = readableOn(primary),
            primaryContainer = primaryContainer,
            onPrimaryContainer = readableTint(tone(0.20f), primaryContainer),
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

/** Couleur libre proposée par le sélecteur de teinte : saturation et luminosité fixes, teinte choisie. */
fun hueToArgb(hue: Float): Int = hslToArgb(hue, FreeColourSaturation, FreeColourLightness)

/** Teinte, en degrés, d'une couleur : sert à placer le curseur du sélecteur. */
fun argbHue(argb: Int): Float = argb.toHsl().hue

/** Lit un code `#RRGGBB` ; renvoie null pour tout autre texte. Le résultat est toujours opaque. */
fun hexToOpaqueArgb(hex: String): Int? {
    if (!HexColour.matches(hex)) return null
    return 0xFF000000.toInt() or hex.substring(1).toInt(16)
}

/** Écrit une couleur opaque sous la forme `#RRGGBB` en majuscules. */
fun opaqueArgbToHex(argb: Int): String = "#%06X".format(argb and 0xFFFFFF)

private const val FreeColourSaturation = 0.7f
private const val FreeColourLightness = 0.5f
private val HexColour = Regex("#[0-9A-Fa-f]{6}")

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

internal fun relativeLuminance(argb: Int): Double {
    fun linear(channel: Int): Double {
        val c = channel / 255.0
        return if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
    }
    return 0.2126 * linear((argb shr 16) and 0xFF) +
        0.7152 * linear((argb shr 8) and 0xFF) +
        0.0722 * linear(argb and 0xFF)
}
