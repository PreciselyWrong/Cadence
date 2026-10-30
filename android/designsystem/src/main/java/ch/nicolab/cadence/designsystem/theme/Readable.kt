package ch.nicolab.cadence.designsystem.theme

import kotlin.math.roundToInt

private const val WHITE = 0xFFFFFFFF.toInt()
private const val INK = 0xFF1B1B21.toInt()
private const val BLACK = 0xFF000000.toInt()
private const val MIN_CONTRAST = 4.5
private const val LIGHTNESS_STEP = 0.02f

/**
 * Encre lisible sur un fond opaque : blanc ou `#1B1B21` quand l'un des deux atteint
 * [MIN_CONTRAST]. Pour une teinte de luminance moyenne (corail, ambre…) aucun des deux n'y
 * arrive : l'encre prend alors la teinte du fond, assombrie jusqu'au seuil.
 */
fun readableOn(backgroundArgb: Int): Int = when {
    contrastRatio(WHITE, backgroundArgb) >= MIN_CONTRAST -> WHITE
    contrastRatio(INK, backgroundArgb) >= MIN_CONTRAST -> INK
    else -> readableTint(backgroundArgb, backgroundArgb)
}

/**
 * Texte teinté lisible : garde la teinte et la saturation de [tintArgb] et ne déplace que la
 * luminosité, vers l'encre ou vers le blanc, jusqu'à [minContrast] sur [backgroundArgb].
 * Une teinte déjà lisible est rendue telle quelle.
 */
fun readableTint(tintArgb: Int, backgroundArgb: Int, minContrast: Double = MIN_CONTRAST): Int {
    if (contrastRatio(tintArgb, backgroundArgb) >= minContrast) return tintArgb
    val hsl = tintArgb.toHsl()
    // Noir et blanc se rejoignent à 4,58 : l'extrême le plus contrasté atteint toujours le seuil.
    val towardDark = contrastRatio(BLACK, backgroundArgb) >= contrastRatio(WHITE, backgroundArgb)
    var lightness = hsl.lightness
    while (lightness in 0f..1f) {
        lightness += if (towardDark) -LIGHTNESS_STEP else LIGHTNESS_STEP
        val candidate = hslToArgb(hsl.hue, hsl.saturation, lightness.coerceIn(0f, 1f))
        if (contrastRatio(candidate, backgroundArgb) >= minContrast) return candidate
    }
    return readableOn(backgroundArgb)
}

/** Pose [foregroundArgb] à l'opacité [alpha] sur [backgroundArgb] opaque : résultat opaque. */
fun compositeOver(foregroundArgb: Int, alpha: Float, backgroundArgb: Int): Int {
    fun channel(shift: Int): Int {
        val fg = (foregroundArgb shr shift) and 0xFF
        val bg = (backgroundArgb shr shift) and 0xFF
        return (fg * alpha + bg * (1f - alpha)).roundToInt().coerceIn(0, 255)
    }
    return (0xFF shl 24) or (channel(16) shl 16) or (channel(8) shl 8) or channel(0)
}
