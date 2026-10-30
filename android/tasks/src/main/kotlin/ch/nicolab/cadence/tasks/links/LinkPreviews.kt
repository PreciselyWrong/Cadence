package ch.nicolab.cadence.tasks.links

import kotlinx.coroutines.flow.Flow

/** Aperçus de liens pour les écrans : lecture du cache, chargement paresseux par le serveur. */
interface LinkPreviews {
    /** Aperçu en cache pour [url], null tant qu'il n'a jamais été chargé. */
    fun observe(url: String): Flow<CachedPreview?>

    /** Charge ou rafraîchit [url] si le cache est absent ou périmé ; ne lève rien hors ligne. */
    suspend fun ensure(url: String)
}
