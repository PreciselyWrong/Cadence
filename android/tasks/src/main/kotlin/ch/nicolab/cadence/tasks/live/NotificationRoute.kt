package ch.nicolab.cadence.tasks.live

import android.content.Context
import android.content.Intent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Cible d'un toucher sur une notification (système ou écran des notifications), posée par [route] à chaque intent
 * d'une notification : l'activité la reçoit au lancement comme quand elle tourne déjà (`onNewIntent`), et
 * `CadenceAppScreen` l'ouvre puis la consomme.
 */
object NotificationRoute {
    const val EXTRA_TARGET = "cadence_notification_target"

    private val _pending = MutableStateFlow<NotificationTarget?>(null)
    val pending: StateFlow<NotificationTarget?> = _pending.asStateFlow()

    fun route(intent: Intent?) {
        NotificationTargets.decode(intent?.getStringExtra(EXTRA_TARGET))?.let { _pending.value = it }
    }

    fun consume() {
        _pending.value = null
    }

    /** Intent de l'app qui porte [target] ; null si l'app n'a pas d'activité de lancement. */
    fun intent(context: Context, target: NotificationTarget): Intent? =
        context.packageManager.getLaunchIntentForPackage(context.packageName)?.putExtra(EXTRA_TARGET, NotificationTargets.encode(target))
}
