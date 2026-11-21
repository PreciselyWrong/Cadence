package ch.nicolab.cadence.tasks.google

import android.content.Intent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Relaie le retour du navigateur (`cadence://google?...`) reçu par `MainActivity` (`onCreate` / `onNewIntent`)
 * vers `CadenceAppScreen` (snackbar) et `CalendarsPage` (rafraîchissement).
 */
object GoogleOAuthRoute {
    private val _pending = MutableStateFlow<GoogleOAuthOutcome?>(null)
    val pending: StateFlow<GoogleOAuthOutcome?> = _pending.asStateFlow()

    private val _refreshCount = MutableStateFlow(0)
    val refreshCount: StateFlow<Int> = _refreshCount.asStateFlow()

    fun route(intent: Intent?) {
        val outcome = GoogleOAuthReturn.parse(intent?.dataString) ?: return
        _pending.value = outcome
        _refreshCount.value += 1
    }

    fun consume() {
        _pending.value = null
    }
}
