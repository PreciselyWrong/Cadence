package ch.nicolab.cadence.tasks.ui

import android.content.Context
import androidx.core.content.edit

/** Disposition choisie par écran, sur l'appareil seulement : galerie (notes, par défaut), outliner (page d'un projet). */
internal class LayoutStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isOn(screen: String): Boolean = prefs.getBoolean(screen, screen == NOTES)

    fun set(screen: String, on: Boolean) = prefs.edit { putBoolean(screen, on) }

    companion object {
        const val NOTES = "notes"

        /** Page d'un projet : liste des tâches ou outliner. */
        const val OUTLINE = "project_outline"
        private const val PREFS = "cadence_layouts"
    }
}
