package ch.nicolab.cadence.tasks.data

import ch.nicolab.cadence.tasks.links.CachedPreview
import ch.nicolab.cadence.tasks.links.LinkPreviews
import ch.nicolab.cadence.tasks.links.PreviewCachePolicy
import ch.nicolab.cadence.tasks.sync.AuthError
import ch.nicolab.cadence.tasks.sync.ProtocolError
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Aperçus de liens servis depuis Room et rafraîchis par le serveur (`GET /api/url/title`, protégé
 * contre le SSRF côté serveur). L'appareil n'interroge aucun site : seule l'image rapportée par le
 * serveur est chargée ensuite, par le chargeur d'images.
 */
internal class RoomLinkPreviews(
    private val dao: LinkPreviewDao,
    private val fetch: suspend (url: String) -> JsonObject,
    private val nowMs: () -> Long = System::currentTimeMillis,
) : LinkPreviews {
    private val locks = ConcurrentHashMap<String, Mutex>()
    private val transientFailures = ConcurrentHashMap<String, Long>()
    private val limiter = Semaphore(MAX_PARALLEL)
    @Volatile private var pruned = false

    override fun observe(url: String): Flow<CachedPreview?> = dao.observe(url).map { it?.toCached() }

    override suspend fun ensure(url: String) {
        if (!PreviewCachePolicy.needsFetch(dao.get(url)?.toCached(), nowMs())) return
        locks.computeIfAbsent(url) { Mutex() }.withLock {
            val previous = dao.get(url)?.toCached()
            val now = nowMs()
            if (!PreviewCachePolicy.needsFetch(previous, now)) return
            if (now - (transientFailures[url] ?: Long.MIN_VALUE / 2) < TRANSIENT_RETRY_MS) return
            prune(now)
            val result = limiter.withPermit { load(url, previous) } ?: return
            dao.upsert(result.toEntity())
        }
    }

    /** Null quand rien ne doit être écrit : hors ligne ou serveur non configuré, on réessaiera plus tard. */
    private suspend fun load(url: String, previous: CachedPreview?): CachedPreview? = try {
        val answer = fetch(url)
        PreviewCachePolicy.fromServer(url, answer.text("title"), answer.text("description"), answer.text("image"), nowMs())
    } catch (error: CancellationException) {
        throw error
    } catch (error: AuthError) {
        null
    } catch (error: ProtocolError) {
        PreviewCachePolicy.afterFailedRefresh(previous, nowMs(), url)
    } catch (error: IOException) {
        transientFailures[url] = nowMs()
        null
    }

    private suspend fun prune(now: Long) {
        if (pruned) return
        pruned = true
        dao.deleteOlderThan(now - RETENTION_MS)
    }

    private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

    private companion object {
        const val MAX_PARALLEL = 3
        const val TRANSIENT_RETRY_MS = 60_000L
        const val RETENTION_MS = 30L * 24 * 60 * 60 * 1000
    }
}

private fun LinkPreviewEntity.toCached() = CachedPreview(url, title, description, imageUrl, fetchedAtMs, failed)

private fun CachedPreview.toEntity() = LinkPreviewEntity(url, title, description, imageUrl, fetchedAtMs, failed)
