package ch.nicolab.cadence.tasks.links

import java.net.URI
import java.net.URLDecoder

/** A Gmail web link; [query] is its search, when the link is a search. */
data class GmailLink(val query: String?)

/**
 * Gmail on a phone (app or mobile web) ignores the `#…` part of a Gmail address, so a link to a
 * thread opens the inbox. A search link still carries something usable: its query, pasted into
 * Gmail's search, finds the mail.
 */
object GmailLinks {
    private const val SEARCH = "search/"

    fun parse(url: String): GmailLink? {
        val uri = runCatching { URI(url) }.getOrNull() ?: return null
        if (uri.scheme?.lowercase() !in setOf("http", "https") || uri.host?.lowercase() != "mail.google.com") return null
        val fragment = uri.rawFragment.orEmpty()
        val query = fragment.takeIf { it.startsWith(SEARCH) }
            ?.removePrefix(SEARCH)
            ?.let { URLDecoder.decode(it, Charsets.UTF_8) }
            ?.takeIf { it.isNotBlank() }
        return GmailLink(query)
    }
}
