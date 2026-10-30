package ch.nicolab.cadence.tasks.links

/** Aperçu gardé sur l'appareil. [failed] marque un échec mis en cache pour ne pas réinterroger sans cesse. */
data class CachedPreview(
    val url: String,
    val title: String?,
    val description: String?,
    val imageUrl: String?,
    val fetchedAtMs: Long,
    val failed: Boolean,
)

/** Règles de fraîcheur du cache d'aperçus ; sans horloge propre pour rester testable. */
object PreviewCachePolicy {
    const val SUCCESS_TTL_MS = 7L * 24 * 60 * 60 * 1000
    const val FAILURE_TTL_MS = 60L * 60 * 1000

    fun needsFetch(entry: CachedPreview?, nowMs: Long): Boolean {
        if (entry == null) return true
        val ttl = if (entry.failed) FAILURE_TTL_MS else SUCCESS_TTL_MS
        return nowMs - entry.fetchedAtMs >= ttl
    }

    /**
     * Un rafraîchissement raté garde le contenu déjà connu, affichable hors ligne, et ne réessaie
     * qu'après [FAILURE_TTL_MS] ; sans contenu connu, l'échec devient lui-même une entrée.
     */
    fun afterFailedRefresh(previous: CachedPreview?, nowMs: Long, url: String? = previous?.url): CachedPreview =
        if (previous != null && !previous.failed) {
            previous.copy(fetchedAtMs = nowMs - SUCCESS_TTL_MS + FAILURE_TTL_MS)
        } else {
            CachedPreview(url.orEmpty(), null, null, null, nowMs, failed = true)
        }

    /** Réponse de `GET /api/url/title` : champs vides écartés, image http passée en https, autre schéma refusé. */
    fun fromServer(url: String, title: String?, description: String?, image: String?, nowMs: Long) = CachedPreview(
        url = url,
        title = title?.trim()?.ifEmpty { null },
        description = description?.trim()?.ifEmpty { null },
        imageUrl = secureImage(image),
        fetchedAtMs = nowMs,
        failed = false,
    )

    private fun secureImage(raw: String?): String? {
        val value = raw?.trim().orEmpty()
        return when {
            value.startsWith("https://", ignoreCase = true) -> value
            value.startsWith("http://", ignoreCase = true) -> "https://" + value.substring("http://".length)
            else -> null
        }
    }
}
