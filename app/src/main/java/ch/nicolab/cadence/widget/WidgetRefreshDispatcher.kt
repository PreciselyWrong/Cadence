package ch.nicolab.cadence.widget

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class WidgetRefreshDispatcher(
    private val scope: CoroutineScope,
    private val refresh: suspend () -> Unit,
) {
    /**
     * Lance le rafraîchissement sur la portée applicative pour qu'il survive à l'écran.
     * Le [Job] rendu permet à l'appelant d'attendre la mise à jour avant de confirmer.
     */
    fun request(): Job = scope.launch { refresh() }
}
