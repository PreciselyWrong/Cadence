package ch.nicolab.cadence.tasks.sync

import ch.nicolab.cadence.data.sync.ApplyResult
import ch.nicolab.cadence.data.sync.HabitSyncStorage
import ch.nicolab.cadence.data.sync.OutboxEntry
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class HabitSyncStoreTest {
    private class FakeStorage : HabitSyncStorage {
        val entries = mutableListOf<OutboxEntry>()
        val rows = mutableMapOf<Pair<String, String>, Map<String, Any?>>()
        val applied = mutableListOf<Pair<String, JsonObject>>()
        val deletedEntries = mutableListOf<String>()
        var floor = 0L
        var result: ApplyResult = ApplyResult.Applied()

        override suspend fun pendingEntries(maxRows: Int) = entries.toList()
        override suspend fun row(entity: String, uid: String) = rows[entity to uid]
        override suspend fun clear(entries: Collection<OutboxEntry>) { this.entries.removeAll(entries.toSet()) }
        override suspend fun apply(entity: String, data: JsonObject): ApplyResult {
            applied += entity to data
            return result
        }
        override suspend fun delete(entity: String, uid: String) = Unit
        override suspend fun deleteEntry(entryUid: String) { deletedEntries += entryUid }
        override suspend fun displayName(entity: String, uid: String): String? = "Lire"
        override suspend fun markAllDirty() = Unit
        override suspend fun raiseClockFloor(ms: Long) { floor = maxOf(floor, ms) }
        override fun observeLastChange(): Flow<Long> = emptyFlow()
    }

    private class Failure(val op: OutboxOp, val reason: String?, val name: String?)

    private val failures = mutableListOf<Failure>()
    private val storage = FakeStorage()
    private val store = HabitSyncStore(storage, "andtest", nowMs = { 1_700_000_000_000L }) { op, reason, name ->
        failures += Failure(op, reason, name)
    }

    @Test
    fun `les operations partent parents d'abord et sont retirees une fois acquittees`() = runTest {
        storage.entries += OutboxEntry("habit_entry", "e1", "value_minor", 5)
        storage.entries += OutboxEntry("habit", "h1", "name", 9)
        storage.rows["habit" to "h1"] = mapOf("name" to "Lire")
        storage.rows["habit_entry" to "e1"] = mapOf("valueMinor" to 5L)

        val ops = store.pendingOps(10)
        assertEquals(listOf("habit", "habit_entry"), ops.map { it.entity })

        store.removeOps(ops.map { it.opId })
        assertTrue(storage.entries.isEmpty())
    }

    @Test
    fun `une ecriture dont la ligne a disparu est retiree sans operation`() = runTest {
        storage.entries += OutboxEntry("habit", "gone", "name", 1)
        assertTrue(store.pendingOps(10).isEmpty())
        assertTrue(storage.entries.isEmpty())
    }

    @Test
    fun `une operation refusee est retiree de la file et montree avec son motif`() = runTest {
        storage.entries += OutboxEntry("habit_goal", "g1", "target_minor", 5)
        storage.rows["habit_goal" to "g1"] = mapOf("targetMinor" to 0L)
        val op = store.pendingOps(10).single()

        store.recordRejected(op, "invalid_value:target_minor")
        store.removeOps(listOf(op.opId))

        assertEquals("invalid_value:target_minor", failures.single().reason)
        assertEquals("Lire", failures.single().name)
        assertTrue(storage.entries.isEmpty(), "pas de boucle : la file est vidée")
        assertTrue(store.pendingOps(10).isEmpty())
    }

    @Test
    fun `une ligne serveur est appliquee et releve le plancher d'horloge`() = runTest {
        val row = buildJsonObject {
            put("uid", "alc-1")
            put("local_date", "2026-10-05")
            put("field_clocks", buildJsonObject { put("local_date", "1700000050000-0003-srv") })
        }
        store.applyServerRow("alcohol_consumption", row)
        assertEquals(1, storage.applied.size)
        assertEquals(1_700_000_050_000L, storage.floor)
    }

    @Test
    fun `une horloge trop avancee ne releve pas le plancher`() = runTest {
        val row = buildJsonObject {
            put("uid", "h1")
            put("field_clocks", buildJsonObject { put("name", "9990000000000-0000-srv") })
        }
        store.applyServerRow("habit", row)
        assertEquals(0L, storage.floor)
    }

    @Test
    fun `un doublon de cle naturelle adopte la ligne du serveur et supprime l'entree en double`() = runTest {
        storage.result = ApplyResult.Applied(replacedEntryUid = "hc-local")
        val row = buildJsonObject { put("uid", "hc-remote"); put("record_id", "r1") }
        store.applyServerRow("health_connect_import", row)
        assertEquals(listOf("hc-local"), storage.deletedEntries)
    }

    @Test
    fun `la charge utile respecte le format de push`() = runTest {
        storage.entries += OutboxEntry("habit", "h1", "name", 1_700_000_000_123L)
        storage.rows["habit" to "h1"] = mapOf("name" to "Lire")
        val payload = store.pendingOps(10).single().payload
        assertEquals("upsert", payload.getValue("action").jsonPrimitive.content)
        val field = payload.getValue("fields").jsonObject.getValue("name").jsonObject
        assertEquals("1700000000123-0000-andtest", field.getValue("hlc").jsonPrimitive.content)
        assertEquals("Lire", field.getValue("value").jsonPrimitive.content)
    }
}
