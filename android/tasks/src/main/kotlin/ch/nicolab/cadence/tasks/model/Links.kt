package ch.nicolab.cadence.tasks.model

import ch.nicolab.cadence.tasks.links.LinkExtractor
import java.net.URI
import java.text.Normalizer
import java.time.Instant
import java.time.LocalDate

/**
 * Deux statuts : « À voir » ([NEW]) et « Archivé » ([DROPPED], gardé mais caché par défaut). Les anciennes valeurs
 * (`to_evaluate`, `tested`, `kept`, `parked`) et toute valeur inconnue, du serveur ou de Room, se lisent [NEW].
 */
enum class LinkStatus(val wire: String) {
    NEW("new"), DROPPED("dropped");

    companion object {
        fun fromWire(value: String?): LinkStatus = if (value == DROPPED.wire) DROPPED else NEW
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
    val projectUid: String? = null,
) {
    val domain: String get() = LinkExtractor.domain(url) ?: url
    val displayTitle: String get() = title?.takeIf { it.isNotBlank() } ?: domain
    val displayDescription: String? get() = (description ?: readmeExcerpt)?.takeIf { it.isNotBlank() }
    val source: LinkSource? get() {
        val kind = LinkSourceKind.fromWire(sourceType) ?: return null
        return sourceUid?.let { LinkSource(kind, it) }
    }
}

/** Filtre de l'écran Liens ; [archived] montre les seuls liens archivés, sinon tous les autres. */
data class LinkFilter(
    val query: String = "",
    val archived: Boolean = false,
    val domain: String? = null,
    val tagUid: String? = null,
    val projectUid: String? = null,
)

/**
 * Un lien à enregistrer par l'appareil (`POST /api/v1/links`, appel différé) : le serveur relit la page. [tagNames] sont
 * des noms (le serveur crée ceux qui manquent) ; [sourceType]/[sourceUid] : l'idée, la tâche ou la note d'où il vient.
 */
data class LinkDraft(
    val url: String,
    val title: String? = null,
    val note: String? = null,
    val tagNames: List<String> = emptyList(),
    val projectUid: String? = null,
    val sourceType: String? = null,
    val sourceUid: String? = null,
) {
    /** Clé de l'appel différé : un même lien depuis une même source n'est envoyé qu'une fois. */
    val callKey: String
        get() = if (sourceType != null && sourceUid != null) "link-add:$sourceType:$sourceUid:$url" else "link-add:$url"
}

/** Ce que la fiche d'un lien permet de changer d'un coup. */
data class LinkEdit(val title: String, val url: String, val note: String, val projectUid: String?)

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
            (link.status == LinkStatus.DROPPED) == filter.archived &&
                (filter.domain == null || link.domain == filter.domain) &&
                (filter.tagUid == null || filter.tagUid in link.tagUids) &&
                (filter.projectUid == null || link.projectUid == filter.projectUid) &&
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
