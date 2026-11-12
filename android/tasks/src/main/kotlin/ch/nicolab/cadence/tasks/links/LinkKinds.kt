package ch.nicolab.cadence.tasks.links

import ch.nicolab.cadence.tasks.model.LinkKind
import java.net.URI
import java.net.URLDecoder

/*
 * Règles des liens, celles du serveur (`backend/modules/links/core/urls.js`, qui fait foi) : une même page a la même
 * adresse et le même genre sur chaque écran, et le nom d'une tâche née d'un lien suit le genre de la page. Pures.
 */

private val TRACKING_PARAM = Regex("utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|igshid|ref_src", RegexOption.IGNORE_CASE)
private val WWW_PREFIX = Regex("^(https?://)www\\.", RegexOption.IGNORE_CASE)
private val REPO_HOSTS = setOf("github.com", "gitlab.com", "codeberg.org", "bitbucket.org")

/** Premiers segments de github.com qui sont des pages du site, pas des propriétaires de dépôt. */
private val GITHUB_RESERVED = setOf(
    "features", "pricing", "about", "topics", "collections", "trending", "marketplace", "orgs", "settings",
    "explore", "sponsors", "login", "join", "search", "notifications", "enterprise",
)
private val VIDEO_HOSTS = setOf("youtube.com", "youtu.be", "vimeo.com", "dailymotion.com", "twitch.tv")
private val ARTICLE_HOSTS = setOf("medium.com", "dev.to", "substack.com", "hashnode.dev", "news.ycombinator.com")

/** Un dépôt sur un hébergeur de code : l'hôte (sans « www. »), le propriétaire et le nom, sans « .git ». */
data class RepoPath(val host: String, val owner: String, val repo: String)

/** L'adresse d'une seule page, écrite d'une seule façon ; null si ce n'est pas une adresse web. */
fun normalizeUrl(url: String): String? {
    val uri = webUri(url) ?: return null
    val scheme = uri.scheme.orEmpty().lowercase()
    val port = uri.port.takeIf { it != -1 && it != defaultPort(scheme) }?.let { ":$it" }.orEmpty()
    val userInfo = uri.rawUserInfo?.let { "$it@" }.orEmpty()
    val path = uri.rawPath.orEmpty().trimEnd('/').ifEmpty { "/" }
    return "$scheme://$userInfo${uri.host.orEmpty().lowercase()}$port$path${keptQuery(uri.rawQuery)}"
}

/** Deux écritures d'une même page sont égales : l'adresse normalisée, sans « www. ». Null si ce n'est pas une adresse web. */
fun addressKey(url: String): String? = normalizeUrl(url)?.let { WWW_PREFIX.replaceFirst(it, "$1") }

/** owner/repo d'une adresse de dépôt, ou null pour toute autre page. */
fun repoPath(url: String): RepoPath? {
    val uri = webUri(url) ?: return null
    val domain = domainOf(uri)
    if (domain !in REPO_HOSTS) return null
    val segments = uri.rawPath.orEmpty().split('/').filter { it.isNotEmpty() }
    val owner = segments.getOrNull(0) ?: return null
    val repo = segments.getOrNull(1) ?: return null
    if (domain == "github.com" && owner.lowercase() in GITHUB_RESERVED) return null
    return RepoPath(domain, owner, repo.removeSuffix(".git"))
}

/** Le genre de page, d'après l'adresse seule : dépôt, vidéo, article, outil (page d'accueil d'un site) ou autre. */
fun classifyKind(url: String): LinkKind {
    val uri = webUri(url) ?: return LinkKind.OTHER
    val domain = domainOf(uri)
    if (repoPath(url) != null) return LinkKind.REPO
    if (hostMatches(domain, VIDEO_HOSTS)) return LinkKind.VIDEO
    if (hostMatches(domain, ARTICLE_HOSTS)) return LinkKind.ARTICLE
    val home = uri.rawPath.isNullOrEmpty() || uri.rawPath == "/"
    return if (home && uri.rawQuery.isNullOrEmpty()) LinkKind.TOOL else LinkKind.OTHER
}

/** Une adresse http(s) avec un hôte qui a un point ; null sinon. */
private fun webUri(url: String): URI? {
    val uri = runCatching { URI(url.trim()) }.getOrNull() ?: return null
    val scheme = uri.scheme?.lowercase() ?: return null
    if (scheme != "http" && scheme != "https") return null
    if (uri.host?.contains('.') != true) return null
    return uri
}

private fun domainOf(uri: URI): String = uri.host.orEmpty().lowercase().removePrefix("www.")

private fun hostMatches(domain: String, hosts: Set<String>): Boolean =
    hosts.any { domain == it || domain.endsWith(".$it") }

private fun defaultPort(scheme: String): Int = if (scheme == "https") 443 else 80

/** Les paramètres gardés, dans leur ordre ; « ? » seulement s'il en reste. */
private fun keptQuery(raw: String?): String {
    val kept = raw.orEmpty().split('&').filter { part ->
        part.isNotEmpty() && !TRACKING_PARAM.matches(decodeName(part.substringBefore('=')))
    }
    return if (kept.isEmpty()) "" else "?" + kept.joinToString("&")
}

private fun decodeName(raw: String): String = runCatching { URLDecoder.decode(raw, "UTF-8") }.getOrDefault(raw)
