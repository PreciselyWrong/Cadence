package ch.nicolab.cadence.tasks.brief.audio

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Réglages de la voix propres à cet appareil (jamais synchronisés) et position de reprise de chaque brief. Un seul
 * exemplaire par processus : le service de lecture, la page des réglages et l'écran du résumé lisent les mêmes flux.
 */
class BriefAudioPrefs internal constructor(private val prefs: SharedPreferences) {
    private val _voiceId = MutableStateFlow(prefs.getString(KEY_VOICE, null))
    /** Voix choisie ; null tant que personne n'a rien choisi (la première du catalogue s'affiche alors). */
    val voiceId: StateFlow<String?> = _voiceId.asStateFlow()

    private val _speed = MutableStateFlow(clampSpeed(prefs.getFloat(KEY_SPEED, 1f)))
    val speed: StateFlow<Float> = _speed.asStateFlow()

    fun setVoice(id: String) {
        prefs.edit { putString(KEY_VOICE, id) }
        _voiceId.value = id
    }

    fun setSpeed(value: Float) {
        val next = clampSpeed(value)
        prefs.edit { putFloat(KEY_SPEED, next) }
        _speed.value = next
    }

    fun position(key: String): Long = prefs.getLong(POSITION + key, 0L)

    fun savePosition(key: String, positionMs: Long) {
        prefs.edit { if (positionMs > 0) putLong(POSITION + key, positionMs) else remove(POSITION + key) }
    }

    /** Oublie les positions des briefs dont le fichier a été effacé. */
    fun prunePositions(keep: Set<String>) {
        val stale = prefs.all.keys.filter { it.startsWith(POSITION) && it.removePrefix(POSITION) !in keep }
        if (stale.isNotEmpty()) prefs.edit { stale.forEach(::remove) }
    }

    companion object {
        const val MIN_SPEED = 0.5f
        const val MAX_SPEED = 2f
        const val SPEED_STEP = 0.1f
        private const val PREFS = "cadence_brief_audio"
        private const val KEY_VOICE = "voice"
        private const val KEY_SPEED = "speed"
        private const val POSITION = "position:"

        /** Vitesse bornée à 0,5-2 et arrondie au dixième (les flottants dérivent après plusieurs pas). */
        fun clampSpeed(value: Float): Float =
            (Math.round(value.coerceIn(MIN_SPEED, MAX_SPEED) * 10f) / 10f)

        @Volatile
        private var instance: BriefAudioPrefs? = null

        fun of(context: Context): BriefAudioPrefs = instance ?: synchronized(this) {
            instance ?: BriefAudioPrefs(
                context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE),
            ).also { instance = it }
        }
    }
}
