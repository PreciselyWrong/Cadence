package ch.nicolab.cadence.tasks.brief.audio

import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URI
import java.net.UnknownHostException

/**
 * Seul accès réseau de la voix locale : le téléchargement de l'archive du modèle, depuis GitHub uniquement (HTTPS,
 * redirections suivies à la main vers les hôtes de release, jamais de texte du résumé envoyé).
 */
object BriefVoiceDownload {
    private val hosts = setOf("github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com")

    fun allowed(url: java.net.URL): Boolean =
        url.protocol == "https" && url.host in hosts && url.userInfo == null && url.port in listOf(-1, 443)

    fun fetch(voice: BriefVoice, store: BriefVoiceStore, checkActive: () -> Unit, progress: (Long) -> Unit) {
        var url = URI(voice.url).toURL()
        repeat(MAX_REDIRECTS) {
            checkActive()
            require(allowed(url)) { "Adresse de téléchargement interdite" }
            val connection = (url.openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = CONNECT_MS
                readTimeout = READ_MS
            }
            try {
                val code = connection.responseCode
                if (code in REDIRECTS) {
                    val location = connection.getHeaderField("Location") ?: error("Redirection sans adresse")
                    url = URI(url.toString()).resolve(location).toURL()
                } else {
                    check(code == 200) { "Téléchargement indisponible (HTTP $code)" }
                    val length = connection.contentLengthLong
                    require(length == -1L || length == voice.pack.bytes) { "Taille de la voix inattendue" }
                    connection.inputStream.use { store.install(voice.pack, it, checkActive, progress) }
                    return
                }
            } finally {
                connection.disconnect()
            }
        }
        error("Trop de redirections pendant le téléchargement")
    }

    /** Phrase de l'échec affichée sous la voix. */
    fun failureMessage(error: Exception): String = when (error) {
        is UnknownHostException -> "Connexion Internet indisponible. Réessayez avec le réseau."
        is SocketTimeoutException -> "Le téléchargement a expiré. Réessayez avec une connexion plus stable."
        else -> error.message ?: "Échec du téléchargement"
    }

    private val REDIRECTS = listOf(301, 302, 303, 307, 308)
    private const val MAX_REDIRECTS = 6
    private const val CONNECT_MS = 15_000
    private const val READ_MS = 20_000
}
