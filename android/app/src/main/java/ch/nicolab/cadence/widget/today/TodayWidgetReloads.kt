package ch.nicolab.cadence.widget.today

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Ce qui change la vue sans écrire dans une base suivie : réglages enregistrés, changement de
 * jour, d'heure ou de fuseau, agendas du fournisseur. Une session ouverte ne relance pas
 * `provideGlance` sur un `update` : elle recharge sur ce signal.
 */
object TodayWidgetReloads {
    private val _requests = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val requests: Flow<Unit> = _requests.asSharedFlow()

    fun request() {
        _requests.tryEmit(Unit)
    }
}
