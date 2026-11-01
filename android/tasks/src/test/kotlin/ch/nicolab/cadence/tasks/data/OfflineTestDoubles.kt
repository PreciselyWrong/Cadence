package ch.nicolab.cadence.tasks.data

import ch.nicolab.cadence.tasks.ConnectionInfo
import ch.nicolab.cadence.tasks.ServerConnection
import ch.nicolab.cadence.tasks.sync.AccountProfile
import ch.nicolab.cadence.tasks.sync.PullPage
import ch.nicolab.cadence.tasks.sync.PushResult
import ch.nicolab.cadence.tasks.sync.SnapshotPage
import ch.nicolab.cadence.tasks.sync.SyncApi
import java.net.ConnectException
import java.time.ZoneId
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.serialization.json.JsonObject

/** Faux réseau et faux compte pour les tests de dépôt hors ligne : rien ne répond, un compte est connecté. */
internal object Unreachable : SyncApi {
    override suspend fun meta(): JsonObject = throw ConnectException("hors ligne")
    override suspend fun profile(): AccountProfile = throw ConnectException("hors ligne")
    override suspend fun snapshot(entity: String, after: Long, cursor: Long?, limit: Int): SnapshotPage = throw ConnectException("hors ligne")
    override suspend fun pull(cursor: Long, limit: Int): PullPage = throw ConnectException("hors ligne")
    override suspend fun push(ops: List<JsonObject>): List<PushResult> = throw ConnectException("hors ligne")
    override suspend fun moveOccurrence(uid: String, scope: String, occurrenceDate: String, dueDate: String) = throw ConnectException("hors ligne")
    override suspend fun send(method: String, path: String, body: JsonObject?): JsonObject = throw ConnectException("hors ligne")
}

internal object Connected : ServerConnection {
    override fun observe(): Flow<ConnectionInfo?> = flowOf(
        ConnectionInfo("http://10.0.2.2:3313", "a@b.c", ZoneId.of("Europe/Paris"), java.time.DayOfWeek.MONDAY, null),
    )
    override suspend fun connect(serverUrl: String, token: String): Result<ConnectionInfo> = error("non")
    override suspend fun disconnect() = Unit
    override fun observeForeignHabits(): Flow<Boolean> = flowOf(false)
    override suspend fun keepForeignHabitsLocal() = Unit
    override suspend fun deleteForeignHabits() = Unit
}
