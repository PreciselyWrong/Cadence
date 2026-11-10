package ch.nicolab.cadence.tasks.links

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler

/**
 * Opens links like the system does, except Gmail links: they open in the browser on Gmail's mobile
 * site, which can show a given mail, never in the Gmail app, which cannot.
 */
private class CadenceUriHandler(private val context: Context, private val system: UriHandler) : UriHandler {
    override fun openUri(uri: String) {
        val mobile = GmailLinks.mobileUrl(uri) ?: return system.openUri(uri)
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(mobile))
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        defaultBrowser()?.let(intent::setPackage)
        context.startActivity(intent)
    }

    /** The app that opens an ordinary web page, so Gmail's own app does not catch the address. */
    private fun defaultBrowser(): String? {
        val probe = Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")).addCategory(Intent.CATEGORY_BROWSABLE)
        return context.packageManager.resolveActivity(probe, PackageManager.MATCH_DEFAULT_ONLY)
            ?.activityInfo?.packageName?.takeIf { it != "android" }
    }
}

@Composable
fun ProvideCadenceUriHandler(content: @Composable () -> Unit) {
    val context = LocalContext.current
    val system = LocalUriHandler.current
    val handler = remember(context, system) { CadenceUriHandler(context, system) }
    CompositionLocalProvider(LocalUriHandler provides handler, content = content)
}
