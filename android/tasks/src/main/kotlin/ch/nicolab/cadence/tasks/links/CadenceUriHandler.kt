package ch.nicolab.cadence.tasks.links

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import ch.nicolab.cadence.tasks.R

private const val GMAIL_PACKAGE = "com.google.android.gm"

/**
 * Opens links like the system does, except Gmail links: the Gmail app cannot open a given mail
 * from an address, so the link's search is copied and Gmail opens, ready for a paste.
 */
private class CadenceUriHandler(private val context: Context, private val system: UriHandler) : UriHandler {
    override fun openUri(uri: String) {
        val gmail = GmailLinks.parse(uri) ?: return system.openUri(uri)
        val app = context.packageManager.getLaunchIntentForPackage(GMAIL_PACKAGE) ?: return system.openUri(uri)
        val message = gmail.query?.let { query ->
            context.getSystemService(ClipboardManager::class.java)
                ?.setPrimaryClip(ClipData.newPlainText("Gmail", query))
            context.getString(R.string.tasks_gmail_search_copied, query)
        } ?: context.getString(R.string.tasks_gmail_no_search)
        Toast.makeText(context, message, Toast.LENGTH_LONG).show()
        context.startActivity(app.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

@Composable
fun ProvideCadenceUriHandler(content: @Composable () -> Unit) {
    val context = LocalContext.current
    val system = LocalUriHandler.current
    val handler = remember(context, system) { CadenceUriHandler(context, system) }
    CompositionLocalProvider(LocalUriHandler provides handler, content = content)
}
