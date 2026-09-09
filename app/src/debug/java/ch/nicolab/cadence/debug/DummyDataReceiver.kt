package ch.nicolab.cadence.debug

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import ch.nicolab.cadence.CadenceApp
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class DummyDataReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_POPULATE) return
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            pending.resultCode = runCatching {
                val app = context.applicationContext as CadenceApp
                DummyDataSeeder.seed(app, LocalDate.now(), ZoneId.systemDefault())
            }.fold({ Activity.RESULT_OK }, { Activity.RESULT_CANCELED })
            pending.finish()
        }
    }

    companion object {
        const val ACTION_POPULATE = "ch.nicolab.cadence.debug.POPULATE_DUMMY_DATA"
    }
}
