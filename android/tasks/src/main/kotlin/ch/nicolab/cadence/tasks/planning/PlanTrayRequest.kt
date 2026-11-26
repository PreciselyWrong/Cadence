package ch.nicolab.cadence.tasks.planning

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Demande d'ouvrir Planifier avec le tiroir « À placer » déplié (action « Voir » après une capture sans date).
 * `TasksScreen` bascule sur Planifier, `PlanTab` ouvre le tiroir puis la consomme : posée avant que ces écrans
 * soient composés, elle reste valable jusqu'à ce qu'ils la lisent.
 */
object PlanTrayRequest {
    private val _pending = MutableStateFlow(false)
    val pending: StateFlow<Boolean> = _pending.asStateFlow()

    fun request() {
        _pending.value = true
    }

    fun consume() {
        _pending.value = false
    }
}
