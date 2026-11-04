package ch.nicolab.cadence.tasks.brief

import ch.nicolab.cadence.tasks.data.BriefDao
import ch.nicolab.cadence.tasks.data.BriefEntity
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.JsonObject

/** Brief d'une date, tel que lu la dernière fois ; [brief] est null si le JSON gardé ne se lit plus. */
data class CachedBrief(
    val date: LocalDate,
    val brief: BriefDto?,
    val version: Int,
    val status: String,
    val generatedAt: String?,
    val fetchedAtMs: Long,
)

/**
 * Brief du jour : lecture `GET /daily-plan/:date/brief` quand le serveur répond, sinon la dernière lecture gardée dans
 * Room. Une lecture n'écrit jamais rien côté serveur ; les actions du brief passent par [BriefActions].
 */
class BriefRepository internal constructor(
    private val dao: BriefDao,
    private val call: suspend (method: String, path: String, query: Map<String, String>, body: JsonObject?) -> JsonObject,
    private val zone: suspend () -> ZoneId,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    fun observe(date: LocalDate): Flow<CachedBrief?> = dao.observe(date.toString()).map { row -> row?.let(::cached) }

    /** Relit le brief de [date] ; sans brief côté serveur, la ligne gardée est effacée. Hors ligne : échec, cache conservé. */
    suspend fun refresh(date: LocalDate): Result<Unit> = try {
        val envelope = BriefCodec.envelope(call("GET", "/api/v1/daily-plan/$date/brief", emptyMap(), null))
        val json = envelope.briefJson
        if (json == null) {
            dao.delete(date.toString())
        } else {
            dao.put(BriefEntity(date.toString(), json, envelope.version, envelope.status, envelope.generatedAt, clock()))
        }
        Result.success(Unit)
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        Result.failure(error)
    }

    /** Le brief du jour tel que gardé, sans appel réseau ; null quand il n'y en a pas. */
    suspend fun cachedToday(): CachedBrief? = dao.observe(LocalDate.now(zone()).toString()).first()?.let(::cached)

    /** Relit le brief du jour, dans le fuseau du compte. */
    suspend fun refreshToday(): Result<Unit> = refresh(LocalDate.now(zone()))

    private fun cached(row: BriefEntity): CachedBrief = CachedBrief(
        date = LocalDate.parse(row.date),
        brief = runCatching { BriefCodec.decode(row.json) }.getOrNull(),
        version = row.version,
        status = row.status,
        generatedAt = row.generatedAt,
        fetchedAtMs = row.fetchedAtMs,
    )
}
