package ch.nicolab.cadence.designsystem.theme

enum class ThemeMode { SYSTEM, LIGHT, DARK }

sealed interface AccentChoice {
    data class Preset(val preset: AccentPreset) : AccentChoice

    data class Custom(val argb: Int) : AccentChoice
}

/** Couleur source à partir de laquelle les rôles d'accent sont dérivés. */
val AccentChoice.seedArgb: Int
    get() = when (this) {
        is AccentChoice.Preset -> preset.argb
        is AccentChoice.Custom -> argb
    }

/** Réglages visuels de l'utilisateur, appliqués par [CadenceTheme]. */
data class Appearance(
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val accent: AccentChoice = AccentChoice.Preset(AccentPreset.VIOLET),
    val materialYou: Boolean = false,
    val pureBlack: Boolean = false,
) {
    companion object {
        val Default = Appearance()
    }
}
