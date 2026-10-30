package ch.nicolab.cadence.tasks.data

import java.net.URI

/**
 * Adresse saisie → origine du serveur sans `/` final, `https://` par défaut.
 * Null si ce n'est pas une adresse d'hôte exploitable.
 */
internal fun normalizeServerUrl(raw: String): String? {
    val value = raw.trim()
    if (value.isBlank()) return null
    val withScheme = if ("://" in value) value else "https://$value"
    val origin = withScheme.trimEnd('/')
    val host = runCatching { URI(origin).host }.getOrNull()
    return origin.takeIf { !host.isNullOrBlank() }
}
