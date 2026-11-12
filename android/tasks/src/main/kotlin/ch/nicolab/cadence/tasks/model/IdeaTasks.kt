package ch.nicolab.cadence.tasks.model

import ch.nicolab.cadence.tasks.links.LinkExtractor

/**
 * Ce que devient une idée de l'Inbox ou un texte partagé (`../docs/37-links.md`, le web fait foi) : une tâche nommée
 * d'après la page, une entrée des liens, ou l'idée telle quelle. Les étiquettes et le projet se choisissent au moment
 * de la décision : une idée n'en porte pas.
 */
object IdeaTasks {
    /** La première adresse du texte, s'il y en a une. */
    fun address(text: String): String? = LinkExtractor.urls(text, 1).firstOrNull()

    /**
     * L'adresse d'une saisie qui n'est qu'un lien (web : `linkOnlyAddress`) : une seule ligne, l'adresse, au plus des
     * `#étiquettes` et un `+projet` ou `~domaine` ; sinon null. Seule une telle saisie propose « Liens ».
     */
    fun linkOnly(text: String): String? {
        if (text.trim().contains('\n')) return null
        val url = address(text) ?: return null
        val rest = LinkLists.textAround(text, url)
            .replace(Regex("""(^|\s)#[^\s#]+"""), " ")
            .replace(Regex("""(^|\s)[+~](?:"[^"]+"|\S+)"""), " ")
            .trim()
        return if (rest.isEmpty()) url else null
    }

    /** Le texte sans son adresse ; tout le texte rogné quand il n'en a pas. */
    fun rest(text: String): String {
        val url = address(text) ?: return text.trim()
        return LinkLists.textAround(text, url)
    }

    /** Nom de la tâche : le titre de la page s'il est connu, sinon le texte sans l'adresse, sinon le domaine. */
    fun taskName(text: String, pageTitle: String?): String {
        val url = address(text) ?: return text.trim()
        return pageTitle?.trim()?.takeIf { it.isNotEmpty() }
            ?: rest(text).ifEmpty { LinkExtractor.domain(url) ?: url }
    }

    /** Note de la tâche : l'adresse, puis le reste du texte ; rien pour une idée sans adresse. */
    fun taskNote(text: String): String? {
        val url = address(text) ?: return null
        return listOf(url, rest(text)).filter { it.isNotEmpty() }.joinToString("\n\n")
    }

    /**
     * L'entrée des liens d'un texte qui porte une adresse : titre de la page s'il est connu, le reste du texte en note.
     * [sourceUid] : l'idée de l'Inbox d'où il vient (`source_type` `inbox_item`), null pour un partage direct.
     */
    fun linkDraft(
        text: String,
        pageTitle: String?,
        tagNames: List<String>,
        projectUid: String?,
        sourceUid: String? = null,
    ): LinkDraft? {
        val url = address(text) ?: return null
        return LinkDraft(
            url = url,
            title = pageTitle?.trim()?.takeIf { it.isNotEmpty() },
            note = rest(text).ifEmpty { null },
            tagNames = tagNames.distinct(),
            projectUid = projectUid,
            sourceType = sourceUid?.let { LinkSourceKind.INBOX_ITEM.wire },
            sourceUid = sourceUid,
        )
    }

    /** Noms des étiquettes choisies, dans l'ordre du choix : le serveur reçoit des noms (`tags`), pas des uid. */
    fun tagNames(tagUids: List<String>, tags: List<TagItem>): List<String> =
        tagUids.mapNotNull { uid -> tags.firstOrNull { it.uid == uid }?.name }
}
