package ch.nicolab.cadence.tasks.model

import ch.nicolab.cadence.tasks.links.LinkExtractor
import java.net.URI
import java.text.Normalizer
import java.time.Instant
import java.time.LocalDate

/** Ce que l'utilisateur a fait d'un lien ; valeur serveur dans [wire]. */
enum class LinkStatus(val wire: String) {
    NEW("new"), TO_EVALUATE("to_evaluate"), TESTED("tested"), KEPT("kept"), PARKED("parked"), DROPPED("dropped");

    companion object {
        fun fromWire(value: String?): LinkStatus = entries.firstOrNull { it.wire == value } ?: NEW
    }
}

/** Nature du lien, décidée par le serveur à partir de l'adresse et de la page. */
enum class LinkKind(val wire: String) {
    REPO("repo"), ARTICLE("article"), VIDEO("video"), TOOL("tool"), OTHER("other");

    companion object {
        fun fromWire(value: String?): LinkKind = entries.firstOrNull { it.wire == value } ?: OTHER
    }
}

/** Où le serveur a trouvé le lien : valeur serveur dans [wire] (`source_type`). */
enum class LinkSourceKind(val wire: String) {
    TASK("task"), NOTE("note"), INBOX_ITEM("inbox_item");

    companion object {
        fun fromWire(value: String?): LinkSourceKind? = entries.firstOrNull { it.wire == value }
    }
}

/** La fiche, la note ou l'idée d'où vient un lien, ouverte par « Aller à la source ». */
data class LinkSource(val kind: LinkSourceKind, val uid: String)

/**
 * Lien trouvé par le serveur dans une idée, une tâche ou une note (docs/37-links.md) : ses métadonnées
 * sont celles du serveur, la note, le statut et les étiquettes sont à l'utilisateur.
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
    val status: LinkStatus = LinkStatus.NEW,
    val tagUids: List<String> = emptyList(),
    val sourceType: String? = null,
    val sourceUid: String? = null,
    /** Le serveur lit encore la page. */
    val fetching: Boolean = false,
    val createdAt: Instant? = null,
    val pendingSync: Boolean = false,
    /** Jour où revoir un lien mis de côté ; jamais une échéance. */
    val reviewAt: LocalDate? = null,
) {
    val domain: String get() = LinkExtractor.domain(url) ?: url
    val displayTitle: String get() = title?.takeIf { it.isNotBlank() } ?: domain
    val displayDescription: String? get() = (description ?: readmeExcerpt)?.takeIf { it.isNotBlank() }
    val source: LinkSource? get() {
        val kind = LinkSourceKind.fromWire(sourceType) ?: return null
        return sourceUid?.let { LinkSource(kind, it) }
    }
}

/** Filtre de l'écran Liens ; [status] null montre tout sauf les liens jetés, [tagUid] garde les liens qui portent l'étiquette. */
data class LinkFilter(
    val query: String = "",
    val kind: LinkKind? = null,
    val status: LinkStatus? = null,
    val domain: String? = null,
    val tagUid: String? = null,
)

/** Un thème de la galerie : [name] est null pour les liens sans étiquette. */
data class LinkTheme(val name: String?, val links: List<LinkItem>)

object LinkLists {
    /**
     * Les liens par thème, le premier segment de leur première étiquette (`dev/outils` est dans `dev`) : thèmes par
     * ordre alphabétique, ceux sans étiquette à la fin. L'ordre des liens de chaque thème ne change pas.
     */
    fun byTheme(links: List<LinkItem>, tagNames: Map<String, String>): List<LinkTheme> {
        fun theme(link: LinkItem) = link.tagUids.mapNotNull { tagNames[it] }.minOrNull()?.substringBefore('/')
        val (named, bare) = links.partition { theme(it) != null }
        val groups = named.groupBy { theme(it) }.toSortedMap(compareBy { it }).map { (name, items) -> LinkTheme(name, items) }
        return if (bare.isEmpty()) groups else groups + LinkTheme(null, bare)
    }

    /** Liens qui passent le filtre, du plus récent au plus ancien. [tagNames] : uid → nom, pour la recherche. */
    fun filter(links: List<LinkItem>, filter: LinkFilter, tagNames: Map<String, String> = emptyMap()): List<LinkItem> {
        val words = fold(filter.query).split(Regex("\\s+")).filter { it.isNotEmpty() }
        return links.filter { link ->
            (filter.kind == null || link.kind == filter.kind) &&
                (if (filter.status == null) link.status != LinkStatus.DROPPED else link.status == filter.status) &&
                (filter.domain == null || link.domain == filter.domain) &&
                (filter.tagUid == null || filter.tagUid in link.tagUids) &&
                (words.isEmpty() || haystack(link, tagNames).let { text -> words.all { it in text } })
        }.sortedWith(compareByDescending<LinkItem> { it.createdAt ?: Instant.EPOCH }.thenBy { it.uid })
    }

    /** Sites d'où viennent les liens, les plus fréquents d'abord. */
    fun domains(links: List<LinkItem>): List<String> =
        links.groupingBy { it.domain }.eachCount().entries
            .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key })
            .map { it.key }

    /** Le lien enregistré d'une idée (ou d'une autre [sourceType]) : celui trouvé dans la source, sinon la même page. */
    fun forEntry(links: List<LinkItem>, entryUid: String, content: String, sourceType: String = "inbox_item"): LinkItem? {
        val url = LinkExtractor.urls(content, 1).firstOrNull() ?: return null
        links.firstOrNull { it.sourceType == sourceType && it.sourceUid == entryUid }?.let { return it }
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

    private fun haystack(link: LinkItem, tagNames: Map<String, String>): String = fold(
        listOfNotNull(
            link.title, link.description, link.url, link.note, link.readmeExcerpt, link.siteName,
            *link.tagUids.mapNotNull { tagNames[it] }.toTypedArray(),
        ).joinToString(" "),
    )

    private fun fold(text: String): String =
        Normalizer.normalize(text, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase()
}
