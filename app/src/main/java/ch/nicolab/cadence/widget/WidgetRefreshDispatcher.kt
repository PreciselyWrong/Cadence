package ch.nicolab.cadence.widget

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

class WidgetRefreshDispatcher(
    private val scope: CoroutineScope,
    private val refresh: suspend () -> Unit,
) {
    fun request() {
        scope.launch { refresh() }
    }
}
