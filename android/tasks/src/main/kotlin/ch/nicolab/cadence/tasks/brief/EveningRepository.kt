package ch.nicolab.cadence.tasks.brief

import ch.nicolab.cadence.tasks.data.EveningDao
import ch.nicolab.cadence.tasks.data.EveningEntity
import ch.nicolab.cadence.tasks.sync.HttpError
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.JsonObject

/**
 * Bilan du soir : lecture `GET /daily-plan/:date/evening` quand le serveur répond, sinon la dernière lecture gardée
 * dans Room (table `evening`, une ligne par date : le bilan n'a pas de version, il se recalcule à chaque lecture, d'où
 * une table à part du `brief` du matin). Une lecture n'écrit rien côté serveur.
 */
class EveningRepository internal constructor(
    private val dao: EveningDao,
    private val call: suspend (method: String, path: String, query: Map<String, String>, body: JsonObject?) -> JsonObject,
    private val zone: suspend () -> ZoneId,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    fun observe(date: LocalDate): Flow<CachedEvening?> = dao.observe(date.toString()).map { row -> row?.let(::cached) }

    /**
     * Relit le bilan de [date] et garde la lecture. Un serveur qui ne connaît pas la route (404) ou n'a pas de bilan
     * efface la ligne : le résumé du matin reste affiché. Hors ligne : échec, cache conservé.
     */
    suspend fun refresh(date: LocalDate): Result<Unit> = try {
        val envelope = EveningCodec.envelope(call("GET", "/api/v1/daily-plan/$date/evening", emptyMap(), null))
        val json = envelope.eveningJson
        if (json == null) {
            dao.delete(date.toString())
        } else {
            dao.put(EveningEntity(date.toString(), json, clock()))
            dao.deleteBefore(date.toString())
        }
        Result.success(Unit)
    } catch (error: CancellationException) {
        throw error
    } catch (error: HttpError) {
        if (error.code == NOT_FOUND) dao.delete(date.toString())
        Result.failure(error)
    } catch (error: Exception) {
        Result.failure(error)
    }

    suspend fun refreshToday(): Result<Unit> = refresh(LocalDate.now(zone()))

    /** Relit le bilan seulement quand il est affiché à la place du résumé du matin (réglage actif, heure venue). */
    suspend fun refreshIfDue(settings: JsonObject?): Result<Unit> =
        if (EveningMode.due(settings, java.time.LocalTime.now(zone()))) refreshToday() else Result.success(Unit)

    /** Le bilan du jour tel que gardé, sans appel réseau ; null quand il n'y en a pas. */
    suspend fun cachedToday(): CachedEvening? = dao.observe(LocalDate.now(zone()).toString()).first()?.let(::cached)

    private fun cached(row: EveningEntity): CachedEvening = CachedEvening(
        date = LocalDate.parse(row.date),
        evening = runCatching { EveningCodec.decode(row.json) }.getOrNull(),
        fetchedAtMs = row.fetchedAtMs,
    )

    private companion object {
        const val NOT_FOUND = 404
    }
}
