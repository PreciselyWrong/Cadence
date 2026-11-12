package ch.nicolab.cadence.tasks.plugins

import android.webkit.JavascriptInterface
import java.net.URI

/** Ce qu'une page de plugin peut demander d'ouvrir par `cadence.open(target, ref)` (`/api/plugins/sdk.js`). */
sealed interface PluginTarget {
    data class Task(val uid: String) : PluginTarget
    data class Note(val uid: String) : PluginTarget
    data class Project(val uid: String) : PluginTarget
    data class Url(val url: String) : PluginTarget

    companion object {
        private val UID = Regex("[A-Za-z0-9_-]{1,128}")
        private const val MAX_URL = 4096

        /** Cible connue et référence valide, sinon null : la page n'est pas de confiance pour l'app. */
        fun parse(target: String?, ref: String?): PluginTarget? {
            val value = ref?.trim().orEmpty()
            if (value.isEmpty()) return null
            return when (target) {
                "task" -> value.takeIf(UID::matches)?.let(::Task)
                "note" -> value.takeIf(UID::matches)?.let(::Note)
                "project" -> value.takeIf(UID::matches)?.let(::Project)
                "url" -> value.takeIf(::isWebUrl)?.let(::Url)
                else -> null
            }
        }

        private fun isWebUrl(value: String): Boolean {
            if (value.length > MAX_URL) return false
            val uri = runCatching { URI(value) }.getOrNull() ?: return false
            val scheme = uri.scheme?.lowercase()
            return (scheme == "http" || scheme == "https") && !uri.host.isNullOrEmpty()
        }
    }
}

/**
 * Objet `window.CadenceBridge` d'une page de plugin. Ses méthodes tournent sur le thread JavaScript du WebView :
 * [currentUrl] ne doit pas appeler le WebView, et [onOpen] repasse lui-même sur le thread principal. Le jeton et
 * les ouvertures ne servent qu'une page de même origine que le serveur.
 */
class PluginBridge(
    private val baseUrl: String,
    private val apiToken: String,
    private val currentUrl: () -> String?,
    private val onOpen: (PluginTarget) -> Unit,
) {
    @JavascriptInterface
    fun token(): String = if (fromServer()) apiToken else ""

    @JavascriptInterface
    fun open(target: String?, ref: String?) {
        if (!fromServer()) return
        PluginTarget.parse(target, ref)?.let(onOpen)
    }

    private fun fromServer(): Boolean = currentUrl()?.let { PluginUrls.sameOrigin(baseUrl, it) } == true
}
