package ch.nicolab.cadence.designsystem.theme

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.edit
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/**
 * Traduction des [Appearance] vers des valeurs texte, séparée du stockage pour être testable
 * sans Android. Une valeur absente ou illisible retombe sur le défaut de son seul champ.
 */
object AppearanceCodec {
    const val THEME_MODE = "theme_mode"
    const val ACCENT = "accent"
    const val MATERIAL_YOU = "material_you"
    const val PURE_BLACK = "pure_black"

    val KEYS = listOf(THEME_MODE, ACCENT, MATERIAL_YOU, PURE_BLACK)

    fun encode(appearance: Appearance): Map<String, String> = mapOf(
        THEME_MODE to when (appearance.themeMode) {
            ThemeMode.SYSTEM -> "system"
            ThemeMode.LIGHT -> "light"
            ThemeMode.DARK -> "dark"
        },
        ACCENT to when (val accent = appearance.accent) {
            is AccentChoice.Preset -> accent.preset.id
            is AccentChoice.Custom -> opaqueArgbToHex(accent.argb)
        },
        MATERIAL_YOU to appearance.materialYou.toString(),
        PURE_BLACK to appearance.pureBlack.toString(),
    )

    fun decode(values: Map<String, String?>): Appearance {
        val defaults = Appearance.Default
        return Appearance(
            themeMode = when (values[THEME_MODE]) {
                "system" -> ThemeMode.SYSTEM
                "light" -> ThemeMode.LIGHT
                "dark" -> ThemeMode.DARK
                else -> defaults.themeMode
            },
            accent = decodeAccent(values[ACCENT]) ?: defaults.accent,
            materialYou = values[MATERIAL_YOU]?.toBooleanStrictOrNull() ?: defaults.materialYou,
            pureBlack = values[PURE_BLACK]?.toBooleanStrictOrNull() ?: defaults.pureBlack,
        )
    }

    private fun decodeAccent(value: String?): AccentChoice? {
        if (value == null) return null
        accentPresetOf(value)?.let { return AccentChoice.Preset(it) }
        return hexToOpaqueArgb(value)?.let { AccentChoice.Custom(it) }
    }
}

/** Préférences d'apparence persistées dans `cadence_appearance`. */
class AppearanceStore(context: Context) {
    private val preferences: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun read(): Appearance = AppearanceCodec.decode(
        AppearanceCodec.KEYS.associateWith { preferences.getString(it, null) },
    )

    fun write(appearance: Appearance) {
        preferences.edit {
            AppearanceCodec.encode(appearance).forEach { (key, value) -> putString(key, value) }
        }
    }

    /**
     * Émet la valeur courante puis chaque changement. Le listener est gardé par le collecteur :
     * SharedPreferences ne retient que des références faibles.
     */
    fun changes(): Flow<Appearance> = callbackFlow {
        send(read())
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> trySend(read()) }
        preferences.registerOnSharedPreferenceChangeListener(listener)
        awaitClose { preferences.unregisterOnSharedPreferenceChangeListener(listener) }
    }

    private companion object {
        const val PREFERENCES_NAME = "cadence_appearance"
    }
}

@Composable
fun rememberAppearanceStore(): AppearanceStore {
    val context = LocalContext.current
    return remember(context) { AppearanceStore(context) }
}

/**
 * Apparence enregistrée, mise à jour dès qu'une préférence change. La valeur initiale est lue
 * de façon synchrone : le premier rendu utilise déjà le bon thème, sans clignotement.
 */
@Composable
fun rememberStoredAppearance(): Appearance {
    val store = rememberAppearanceStore()
    val initial = remember(store) { store.read() }
    val appearance by produceState(initialValue = initial, store) {
        store.changes().collect { value = it }
    }
    return appearance
}
