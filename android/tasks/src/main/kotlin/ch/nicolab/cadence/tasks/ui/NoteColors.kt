package ch.nicolab.cadence.tasks.ui

import androidx.compose.ui.graphics.Color

/**
 * Palette de couleurs de note, identique à celle du web (`PALETTE`) : la valeur claire est ce qui est
 * enregistré et synchronisé, la teinte sombre sert seulement à l'affichage sur fond sombre.
 */
internal data class NoteColor(val name: String, val value: String, val light: Color, val dark: Color)

internal val NoteColors = listOf(
    NoteColor("Rouge", "#b91c1c", Color(0xFFB91C1C), Color(0xFFF87171)),
    NoteColor("Orange", "#c2410c", Color(0xFFC2410C), Color(0xFFFB923C)),
    NoteColor("Jaune", "#ca8a04", Color(0xFFCA8A04), Color(0xFFFACC15)),
    NoteColor("Vert", "#15803d", Color(0xFF15803D), Color(0xFF4ADE80)),
    NoteColor("Sarcelle", "#0f766e", Color(0xFF0F766E), Color(0xFF2DD4BF)),
    NoteColor("Cyan", "#0e7490", Color(0xFF0E7490), Color(0xFF22D3EE)),
    NoteColor("Bleu", "#1d4ed8", Color(0xFF1D4ED8), Color(0xFF60A5FA)),
    NoteColor("Indigo", "#4338ca", Color(0xFF4338CA), Color(0xFF818CF8)),
    NoteColor("Violet", "#7e22ce", Color(0xFF7E22CE), Color(0xFFC084FC)),
    NoteColor("Rose", "#be185d", Color(0xFFBE185D), Color(0xFFF472B6)),
    NoteColor("Gris", "#374151", Color(0xFF374151), Color(0xFF9CA3AF)),
)

/** Couleur d'affichage d'une valeur enregistrée : palette connue, ou hexadécimal libre venu du web ; sinon null. */
internal fun noteAccent(raw: String?, dark: Boolean): Color? {
    val value = raw?.trim().orEmpty()
    if (value.isEmpty()) return null
    NoteColors.firstOrNull { it.value.equals(value, ignoreCase = true) }?.let { return if (dark) it.dark else it.light }
    return runCatching { Color(android.graphics.Color.parseColor(value)) }.getOrNull()
}
