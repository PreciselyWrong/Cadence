package ch.nicolab.cadence.tasks.model

import ch.nicolab.cadence.tasks.links.LinkExtractor
import java.net.URI
import java.time.Instant

/** Nature du lien, décidée par le serveur à partir de l'adresse et de la page. */
enum class LinkKind(val wire: String) {
    REPO("repo"), ARTICLE("article"), VIDEO("video"), TOOL("tool"), OTHER("other");

    companion object {
        fun fromWire(value: String?): LinkKind = entries.firstOrNull { it.wire == value } ?: OTHER
    }
}

/**
 * Page d'un projet (entité serveur `link`, `docs/37-links.md`) : l'adresse et la note sont à l'utilisateur, les
 * métadonnées sont celles que le serveur relit dans la page.
 */
data class LinkItem(
    val uid: String,
    val url: String,
    val title: String? = null,
    val description: String? = null,
    val imageUrl: String? = null,
    val siteName: String? = null,
    val kind: LinkKind = LinkKind.OTHER,
    val githubStars: Int? = null,
    val githubLanguage: String? = null,
    val githubLastCommit: Instant? = null,
    val readmeExcerpt: String? = null,
    val note: String? = null,
    /** Le serveur lit encore la page. */
    val fetching: Boolean = false,
    val createdAt: Instant? = null,
    val pendingSync: Boolean = false,
    val projectUid: String? = null,
) {
    val domain: String get() = LinkExtractor.domain(url) ?: url
    val displayTitle: String get() = title?.takeIf { it.isNotBlank() } ?: domain
    val displayDescription: String? get() = (description ?: readmeExcerpt)?.takeIf { it.isNotBlank() }
}

object LinkLists {
    /**
     * La page qui enregistre l'adresse d'une idée ou d'une ligne de revue : la même adresse normalisée (sans « www. »,
     * sans « / » final) dans [content], sinon null.
     */
    fun forEntry(links: List<LinkItem>, content: String): LinkItem? {
        val url = LinkExtractor.urls(content, 1).firstOrNull() ?: return null
        val key = comparable(url)
        return links.firstOrNull { comparable(it.url) == key }
    }

    /** Ce qui est écrit autour du lien : la note que le serveur prend à la capture. */
    fun textAround(content: String, url: String): String =
        content.replace(url, " ")
            .trim { it.isWhitespace() || it in "-–—:|" }
            .replace(Regex("\\s{2,}"), " ")
            .trim()

    /** Le texte de l'idée n'est montré que s'il dit plus que le lien et sa note. */
    fun showsText(content: String, link: LinkItem?): Boolean {
        val url = LinkExtractor.urls(content, 1).firstOrNull() ?: return true
        if (link == null) return !LinkExtractor.isOnlyLink(content)
        val around = textAround(content, url)
        return around.isNotEmpty() && around != (link.note ?: "")
    }

    private fun comparable(url: String): String = runCatching {
        val uri = URI(url)
        val path = uri.path.orEmpty().trimEnd('/').ifEmpty { "/" }
        "${uri.host.orEmpty().lowercase()}$path"
    }.getOrDefault(url)
}

/** Clé de comparaison d'adresses (web : la même règle) : hôte en minuscules, chemin sans `/` final, sans fragment. */
object LinkKeys {
    fun of(url: String): String {
        val noFragment = url.trim().substringBefore('#')
        val scheme = noFragment.substringBefore("://", "")
        val rest = if (scheme.isEmpty()) noFragment else noFragment.substringAfter("://")
        val host = rest.substringBefore('/').substringBefore('?').lowercase()
        val tail = rest.substring(host.length)
        val path = tail.substringBefore('?').trimEnd('/')
        val query = tail.substringAfter('?', "").let { if (it.isEmpty()) "" else "?$it" }
        return "${scheme.lowercase()}://$host$path$query"
    }
}
