package ch.nicolab.cadence.tasks.plugins

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.viewinterop.AndroidView
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.theme.CadenceTheme
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.links.ProvideCadenceUriHandler
import ch.nicolab.cadence.tasks.sync.ServerSession
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Page d'un plugin (`/api/plugins/<id>/ui/<file>`) en plein écran. Le serveur n'accepte que le jeton `tt_` en
 * `Authorization: Bearer` : il est ajouté au chargement et à chaque requête GET de même origine, jamais exposé au
 * JavaScript de la page. Les liens hors de la page du plugin s'ouvrent dehors ; le retour remonte l'historique.
 */
class PluginPageActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val item = PluginMenuItem(
            id = intent.getStringExtra(EXTRA_ID) ?: return finish(),
            label = intent.getStringExtra(EXTRA_LABEL).orEmpty(),
            path = "",
            file = intent.getStringExtra(EXTRA_FILE) ?: return finish(),
        )
        setContent {
            CadenceTheme {
                ProvideCadenceUriHandler { PluginPage(item, onClose = ::finish) }
            }
        }
    }

    companion object {
        private const val EXTRA_ID = "plugin_id"
        private const val EXTRA_LABEL = "plugin_label"
        private const val EXTRA_FILE = "plugin_file"

        fun start(context: Context, item: PluginMenuItem) {
            context.startActivity(
                Intent(context, PluginPageActivity::class.java)
                    .putExtra(EXTRA_ID, item.id)
                    .putExtra(EXTRA_LABEL, item.label)
                    .putExtra(EXTRA_FILE, item.file),
            )
        }
    }
}

private enum class PageProblem { NOT_FOUND, OFFLINE }

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun PluginPage(item: PluginMenuItem, onClose: () -> Unit) {
    val uriHandler = LocalUriHandler.current
    var session by remember { mutableStateOf<ServerSession?>(null) }
    var problem by remember { mutableStateOf<PageProblem?>(null) }
    var webView by remember { mutableStateOf<WebView?>(null) }
    val context = androidx.compose.ui.platform.LocalContext.current

    LaunchedEffect(item.id) {
        session = runCatching { pluginsClient(context).server() }.getOrNull()
        if (session == null) problem = PageProblem.OFFLINE
    }
    BackHandler {
        val view = webView
        if (view != null && view.canGoBack()) view.goBack() else onClose()
    }

    Column(Modifier.fillMaxSize().background(cadence.background).systemBarsPadding()) {
        ScreenHeader(
            title = item.label,
            onBack = onClose,
            backDescription = stringResource(R.string.tasks_back),
            modifier = Modifier.padding(horizontal = Space.gutter),
        )
        Box(Modifier.fillMaxSize()) {
            val server = session
            if (server != null) {
                AndroidView(
                    factory = { viewContext ->
                        WebView(viewContext).apply {
                            settings.javaScriptEnabled = true
                            settings.domStorageEnabled = true
                            settings.allowFileAccess = false
                            settings.allowContentAccess = false
                            webViewClient = PluginWebClient(server, item, uriHandler) { problem = it }
                            loadUrl(PluginUrls.page(server.baseUrl, item), authorization(server))
                            webView = this
                        }
                    },
                    onRelease = { it.destroy() },
                    modifier = Modifier.fillMaxSize(),
                )
            }
            problem?.let {
                Text(
                    stringResource(if (it == PageProblem.NOT_FOUND) R.string.plugins_page_not_found else R.string.plugins_page_offline),
                    style = MaterialTheme.typography.bodyLarge,
                    color = cadence.onSurface,
                    modifier = Modifier.fillMaxWidth().background(cadence.background).padding(Space.gutter),
                )
            }
        }
    }
}

private fun authorization(server: ServerSession) = mapOf("Authorization" to "Bearer ${server.token}")

/**
 * Ajoute le jeton aux GET de même origine (la page, ses fichiers, ses `fetch` vers `/api/plugins/<id>/x/`). Les
 * écritures (POST…) ne peuvent pas être réécrites ici : elles partent sans jeton (`docs/fork/PLUGIN-GUIDE.md`).
 */
private class PluginWebClient(
    private val server: ServerSession,
    item: PluginMenuItem,
    private val uriHandler: UriHandler,
    private val onProblem: (PageProblem?) -> Unit,
) : WebViewClient() {
    private val pluginPrefix = PluginUrls.page(server.baseUrl, item).substringBeforeLast("/ui/") + "/"

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val url = request.url.toString()
        if (url.startsWith(pluginPrefix)) return false
        runCatching { uriHandler.openUri(url) }
        return true
    }

    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
        val url = request.url.toString()
        if (request.method != "GET" || !PluginUrls.sameOrigin(server.baseUrl, url)) return null
        return runCatching { fetch(url, request.requestHeaders) }.getOrNull()
    }

    override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
        onProblem(null)
    }

    override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
        if (request.isForMainFrame && response.statusCode == HttpURLConnection.HTTP_NOT_FOUND) onProblem(PageProblem.NOT_FOUND)
    }

    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        if (request.isForMainFrame) onProblem(PageProblem.OFFLINE)
    }

    /** Suit les redirections de même origine (une [WebResourceResponse] ne peut pas en porter) ; sinon rend la main. */
    private fun fetch(start: String, headers: Map<String, String>): WebResourceResponse? {
        var url = start
        repeat(MAX_REDIRECTS) {
            val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                headers.forEach { (name, value) -> if (name.lowercase() !in DROPPED_REQUEST) setRequestProperty(name, value) }
                setRequestProperty("Authorization", "Bearer ${server.token}")
            }
            val code = connection.responseCode
            if (code in 300..399) {
                val next = connection.getHeaderField("Location")?.let { URL(URL(url), it).toString() }
                connection.disconnect()
                if (next == null || !PluginUrls.sameOrigin(server.baseUrl, next)) return null
                url = next
                return@repeat
            }
            val type = connection.contentType.orEmpty()
            val mime = type.substringBefore(';').trim().ifEmpty { "application/octet-stream" }
            val charset = type.substringAfter("charset=", "").substringBefore(';').trim().ifEmpty { null }
            val body = (if (code >= 400) connection.errorStream else connection.inputStream) ?: ByteArrayInputStream(ByteArray(0))
            val responseHeaders = connection.headerFields
                .filterKeys { it != null && it.lowercase() !in DROPPED_RESPONSE }
                .mapValues { (_, values) -> values.joinToString(", ") }
            return WebResourceResponse(mime, charset, code, connection.responseMessage?.ifBlank { null } ?: "OK", responseHeaders, body)
        }
        return null
    }

    private companion object {
        const val MAX_REDIRECTS = 5
        const val TIMEOUT_MS = 15_000

        /** Pas de cookie (le serveur n'en veut pas) ; la compression reste à `HttpURLConnection`, qui décompresse. */
        val DROPPED_REQUEST = setOf("cookie", "accept-encoding", "authorization")

        /** Le corps rendu est déjà décompressé : ces en-têtes ne le décrivent plus. */
        val DROPPED_RESPONSE = setOf("content-encoding", "content-length", "transfer-encoding")
    }
}
