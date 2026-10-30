package ch.nicolab.cadence.designsystem.theme

private const val WHITE = 0xFFFFFFFF.toInt()
private const val INK = 0xFF1B1B21.toInt()
private const val BLACK = 0xFF000000.toInt()
private const val MIN_CONTRAST = 4.5
private const val DARK_STOP_SHIFT = -0.08f
private const val LIGHT_STOP_SHIFT = 0.06f
private const val LIGHT_TINT_LUMINANCE = 0.5

/** Voile posé sous l'action de la carte : noir sous une encre blanche, blanc sous une encre sombre. */
private const val PILL_SCRIM_ALPHA = 0.22f

/**
 * Couleurs d'une carte d'habitude (e07) : dégradé de trois arrêts de la teinte, encre lisible
 * sur chacun d'eux, et fond de la pastille d'action. Tout texte posé dessus atteint 4,5:1.
 *
 * [pillFillArgb] est translucide ; [pillBackdropArgb] est son rendu opaque sur le dernier arrêt,
 * là où la pastille est posée, et la référence du contraste de son texte.
 */
data class HabitCardColors(
    val stopsArgb: List<Int>,
    val inkArgb: Int,
    val pillFillArgb: Int,
    val pillBackdropArgb: Int,
)

/**
 * Dérive la carte d'une teinte d'habitude. Une teinte claire reçoit l'encre sombre et des arrêts
 * qui restent clairs ; toute autre reçoit l'encre blanche et des arrêts assombris jusqu'au seuil.
 */
fun habitCardColors(tintArgb: Int): HabitCardColors {
    val hsl = tintArgb.toHsl()
    val lightTint = relativeLuminance(tintArgb) >= LIGHT_TINT_LUMINANCE
    val ink = if (lightTint) INK else WHITE
    val raw = listOf(DARK_STOP_SHIFT, 0f, LIGHT_STOP_SHIFT).map {
        hslToArgb(hsl.hue, hsl.saturation, (hsl.lightness + it).coerceIn(0f, 1f))
    }
    val stops = raw.map { readableTint(it, ink, MIN_CONTRAST) }
    val scrim = if (lightTint) WHITE else BLACK
    val pillFill = (scrim and 0x00FFFFFF) or ((PILL_SCRIM_ALPHA * 255).toInt() shl 24)
    return HabitCardColors(
        stopsArgb = stops,
        inkArgb = ink,
        pillFillArgb = pillFill,
        pillBackdropArgb = compositeOver(scrim, PILL_SCRIM_ALPHA, stops.last()),
    )
}
