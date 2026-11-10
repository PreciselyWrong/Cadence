package ch.nicolab.cadence.tasks.links

import java.net.URI

/**
 * Gmail on a phone ignores the `#…` route of a desktop Gmail address (the app opens its inbox, the
 * browser redirects to the mobile site's inbox). The mobile site still opens a thread or a search
 * from its own routes, so a desktop link is rewritten to them. Verified on Firefox Android, 2026-11-10.
 */
object GmailLinks {
    private const val MOBILE = "https://mail.google.com/mail/mu/mp/"
    private const val SEARCH = "search/"

    /** Legacy thread ids, the ones the Gmail API and old desktop links use. */
    private val threadId = Regex("^[0-9a-f]{16}$")

    /** The mobile-site address for a Gmail link, or null when [url] is not a Gmail link. */
    fun mobileUrl(url: String): String? {
        val uri = runCatching { URI(url) }.getOrNull() ?: return null
        if (uri.scheme?.lowercase() !in setOf("http", "https") || uri.host?.lowercase() != "mail.google.com") return null
        val account = uri.rawQuery.orEmpty().split('&').firstOrNull { it.startsWith("authuser=") }
        val base = MOBILE + (account?.let { "?$it" } ?: "")
        val fragment = uri.rawFragment.orEmpty()
        val thread = fragment.substringAfterLast('/', "").takeIf { threadId.matches(it) }
        val search = fragment.takeIf { it.startsWith(SEARCH) }?.removePrefix(SEARCH)?.takeIf { it.isNotBlank() }
        return when {
            thread != null -> "$base#cv/priority/%5Esmartlabel_personal/$thread"
            search != null -> "$base#tl/search/$search"
            else -> base
        }
    }
}
