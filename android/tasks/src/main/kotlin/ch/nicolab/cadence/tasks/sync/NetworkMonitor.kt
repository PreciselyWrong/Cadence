package ch.nicolab.cadence.tasks.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Le téléphone a-t-il un réseau ? Suivi par `ConnectivityManager` : la ligne d'état dit « Hors ligne » et le
 * retour d'un réseau demande aussitôt un passage, sans attendre le passage périodique.
 */
object NetworkMonitor {
    private val _online = MutableStateFlow(true)
    val online: StateFlow<Boolean> = _online.asStateFlow()

    @Volatile private var started = false

    fun start(context: Context) {
        if (started) return
        started = true
        val app = context.applicationContext
        val manager = app.getSystemService(ConnectivityManager::class.java) ?: return
        _online.value = manager.hasInternet()
        manager.registerDefaultNetworkCallback(
            object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) = update(app, true)
                // Le réseau par défaut est perdu : `activeNetwork` le rend parfois encore à cet instant. Un autre
                // réseau qui prend le relais arrive par `onAvailable`.
                override fun onLost(network: Network) = update(app, false)
                override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) =
                    update(app, capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET))
            },
        )
    }

    private fun update(context: Context, online: Boolean) {
        val was = _online.value
        _online.value = online
        if (syncOnConnectivityChange(was, online)) SyncScheduler.requestNow(context)
    }

    private fun ConnectivityManager.hasInternet(): Boolean = runCatching {
        getNetworkCapabilities(activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    }.getOrDefault(true)
}

/** Seul le retour du réseau demande un passage : une perte ou un réseau qui change de forme, non. */
internal fun syncOnConnectivityChange(wasOnline: Boolean, isOnline: Boolean): Boolean = !wasOnline && isOnline

/**
 * Retour au premier plan : un passage, au plus un par [minIntervalMs], pour ne pas en lancer un à chaque
 * rotation ou changement d'écran.
 */
internal class ForegroundGate(private val minIntervalMs: Long, private val nowMs: () -> Long) {
    private var started = 0
    private var lastRequestMs: Long? = null

    /** Une activité démarre ; vrai quand l'app revient au premier plan et qu'un passage est dû. */
    fun onStart(): Boolean {
        started += 1
        if (started != 1) return false
        val now = nowMs()
        val last = lastRequestMs
        if (last != null && now - last < minIntervalMs) return false
        lastRequestMs = now
        return true
    }

    fun onStop() {
        if (started > 0) started -= 1
    }
}
