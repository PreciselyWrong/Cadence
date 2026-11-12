package ch.nicolab.cadence.tasks.model

import ch.nicolab.cadence.tasks.links.LinkExtractor
import ch.nicolab.cadence.tasks.links.classifyKind
import ch.nicolab.cadence.tasks.links.repoPath

/**
 * Le verbe d'un nom de tâche selon le genre de page : un gabarit `%1$s` (« Essayer : %1$s »), ou null pour le titre seul.
 * Les chaînes de l'appli le fournissent ; les tests le fournissent aussi, sans Android.
 */
typealias TaskVerbs = (LinkKind) -> String?

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

    /** Il n'y a qu'une adresse dans le texte : rien à écrire autour, donc une idée de lien seul. */
    fun isOnlyAddress(text: String): Boolean = address(text) != null && rest(text).isEmpty()

    /**
     * Nom de la tâche d'un texte : le titre de la page s'il est connu, sinon le reste du texte, sinon le nom de la page
     * ([fallbackTitle]) ; le verbe du genre de page s'ajoute. Un texte sans adresse est son propre nom.
     */
    fun taskName(text: String, pageTitle: String?, verbs: TaskVerbs): String {
        val url = address(text) ?: return text.trim()
        return capturedName(url, pageTitle?.takeIf { it.isNotBlank() } ?: rest(text).ifEmpty { null }, verbs)
    }

    /**
     * Nom d'une page capturée : « Essayer : <titre> », « Lire : … », « Regarder : … » ou le titre seul, d'après le genre
     * de l'adresse. Sans titre, [fallbackTitle].
     */
    fun capturedName(url: String, pageTitle: String?, verbs: TaskVerbs): String {
        // Un dépôt se nomme par son chemin : les titres de page y sont longs (« GitHub - a/b: … »).
        val title = repoPath(url)?.let { "${it.owner}/${it.repo}" }
            ?: pageTitle?.trim()?.takeIf { it.isNotEmpty() } ?: fallbackTitle(url)
        val template = verbs(classifyKind(url))
        return template?.let { String.format(it, title) } ?: title
    }

    /** Le nom d'une page sans titre : son dépôt (`propriétaire/nom`), sinon son domaine, sinon l'adresse. */
    fun fallbackTitle(url: String): String {
        repoPath(url)?.let { return "${it.owner}/${it.repo}" }
        return LinkExtractor.domain(url) ?: url
    }

    /** Note de la tâche : l'adresse, puis le reste du texte ; rien pour une idée sans adresse. */
    fun taskNote(text: String): String? {
        val url = address(text) ?: return null
        return listOf(url, rest(text)).filter { it.isNotEmpty() }.joinToString("\n\n")
    }
}
