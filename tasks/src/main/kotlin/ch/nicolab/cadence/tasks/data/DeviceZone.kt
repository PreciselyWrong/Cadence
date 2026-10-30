package ch.nicolab.cadence.tasks.data

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import java.time.ZoneId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Fuseau de l'appareil, suivi pendant toute la vie du processus : un changement de fuseau
 * relance les vues qui en dépendent (jour des échéances avec heure).
 */
internal class DeviceZone(context: Context) {
    private val current = MutableStateFlow(ZoneId.systemDefault())
    val zone: StateFlow<ZoneId> = current.asStateFlow()

    init {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                current.value = ZoneId.systemDefault()
            }
        }
        ContextCompat.registerReceiver(
            context,
            receiver,
            IntentFilter(Intent.ACTION_TIMEZONE_CHANGED),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
    }
}
