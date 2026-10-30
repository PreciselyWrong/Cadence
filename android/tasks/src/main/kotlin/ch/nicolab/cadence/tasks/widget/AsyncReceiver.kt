package ch.nicolab.cadence.tasks.widget

import android.content.BroadcastReceiver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Un récepteur ne vit que le temps de `onReceive`. [goAsync] prolonge cette durée le
 * temps d'une écriture en base ou d'un rafraîchissement de widget.
 */
internal fun BroadcastReceiver.runAsync(block: suspend () -> Unit) {
    val pending = goAsync()
    CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
        try {
            block()
        } finally {
            pending.finish()
        }
    }
}
