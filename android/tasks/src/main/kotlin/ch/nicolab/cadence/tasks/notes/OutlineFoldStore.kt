package ch.nicolab.cadence.tasks.notes

import android.content.Context

/**
 * Puces repliées d'une note ou d'une description (`note:<uid>`, `task:<uid>`), sur cet appareil seulement, comme
 * `cadence.outlineFolds.*` du navigateur : clés de [NoteOutline.itemKeys] (texte et rang). Rien n'est synchronisé.
 */
class OutlineFoldStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("cadence_outline_folds", Context.MODE_PRIVATE)

    fun load(scope: String): List<String> =
        prefs.getString(scope, null)?.split('\n')?.filter { it.isNotEmpty() }.orEmpty()

    fun save(scope: String, keys: Collection<String>) {
        if (keys.isEmpty()) prefs.edit().remove(scope).apply()
        else prefs.edit().putString(scope, keys.take(MAX_KEYS).joinToString("\n")).apply()
    }

    private companion object {
        const val MAX_KEYS = 300
    }
}
