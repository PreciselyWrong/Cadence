package ch.nicolab.cadence.tasks.data

import android.content.Context
import kotlin.random.Random

/**
 * État de l'horloge hybride, dans des préférences : la lecture doit être synchrone
 * au démarrage, ce que DataStore ne permet pas.
 */
internal class ClockStateStore(context: Context) {
    private val prefs = context.getSharedPreferences("tududi_sync_clock", Context.MODE_PRIVATE)

    /** Identifiant d'appareil de 12 caractères, préfixé « and ». */
    fun node(): String = prefs.getString(KEY_NODE, null) ?: newNode().also {
        prefs.edit().putString(KEY_NODE, it).apply()
    }

    fun load(): String? = prefs.getString(KEY_STATE, null)

    fun save(state: String) {
        prefs.edit().putString(KEY_STATE, state).apply()
    }

    private fun newNode(): String = "and" + List(9) { ALPHABET[Random.nextInt(ALPHABET.length)] }.joinToString("")

    private companion object {
        const val KEY_NODE = "node"
        const val KEY_STATE = "state"
        const val ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
    }
}
