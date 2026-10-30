package ch.nicolab.cadence.tasks.data

import java.net.URI

/**
 * Adresse saisie → origine du serveur sans `/` final, `https://` par défaut.
 * Seuls http et https sont acceptés. Null si ce n'est pas une adresse exploitable.
 */
internal fun normalizeServerUrl(raw: String): String? {
    val value = raw.trim()
    if (value.isBlank()) return null
    val withScheme = if ("://" in value) value else "https://$value"
    val origin = withScheme.trimEnd('/')
    val uri = runCatching { URI(origin) }.getOrNull() ?: return null
    val scheme = uri.scheme?.lowercase()
    if (scheme != "http" && scheme != "https") return null
    return origin.takeIf { !uri.host.isNullOrBlank() }
}
