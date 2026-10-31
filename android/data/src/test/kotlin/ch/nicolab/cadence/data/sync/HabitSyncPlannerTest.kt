package ch.nicolab.cadence.data.sync

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class HabitSyncPlannerTest {
    private val rows = mapOf(
        ("habit" to "h1") to mapOf<String, Any?>("name" to "Lire", "groupId" to "group-day", "active" to 1L),
        ("habit_timer" to "h1") to mapOf<String, Any?>("habitId" to "h1", "accumulatedSeconds" to 30L, "runningSinceEpochMs" to null),
        ("habit_entry" to "e1") to mapOf<String, Any?>("habitId" to "h1", "valueMinor" to 5L),
    )

    private suspend fun plan(entries: List<OutboxEntry>) = HabitSyncPlanner.plan(entries) { e, u -> rows[e to u] }

    @Test
    fun `un parent part avant ses enfants quel que soit l'ordre de la file`() = runTest {
        val plan = plan(
            listOf(
                OutboxEntry("habit_entry", "e1", "value_minor", 5),
                OutboxEntry("habit", "h1", "name", 9),
                OutboxEntry("habit_timer", "h1", "accumulated_seconds", 7),
            ),
        )
        assertEquals(listOf("habit", "habit_entry", "habit_timer"), plan.ops.map { it.entity })
    }

    @Test
    fun `les deux champs du chronometre partent ensemble avec la meme horloge`() = runTest {
        val op = plan(listOf(OutboxEntry("habit_timer", "h1", "running_since", 40))).ops.single()
        assertEquals(setOf("accumulated_seconds", "running_since"), op.fields.keys)
        assertEquals(setOf(40L), op.fields.values.map { it.changedMs }.toSet())
        val fields = op.toPayload("andabc").getValue("fields").jsonObject
        assertEquals(JsonPrimitive(30L), fields.getValue("accumulated_seconds").jsonObject.getValue("value"))
        assertEquals("0000000000040-0000-andabc", fields.getValue("running_since").jsonObject.getValue("hlc").jsonPrimitive.content)
    }

    @Test
    fun `une suppression emporte les champs de la meme ligne`() = runTest {
        val plan = plan(
            listOf(OutboxEntry("habit", "h1", "name", 1), OutboxEntry("habit", "h1", HabitSyncSpecs.DELETE_MARK, 2)),
        )
        val op = plan.ops.single()
        assertEquals("delete", (op.toPayload("n") as JsonObject).getValue("action").jsonPrimitive.content)
        assertEquals(2, op.entries.size)
    }

    @Test
    fun `une ecriture sans ligne est abandonnee sans rien envoyer`() = runTest {
        val plan = plan(listOf(OutboxEntry("habit", "gone", "name", 1)))
        assertTrue(plan.ops.isEmpty())
        assertEquals(1, plan.orphans.size)
    }

    @Test
    fun `l'identifiant d'operation est stable tant que les ecritures le sont`() = runTest {
        val first = plan(listOf(OutboxEntry("habit", "h1", "name", 1))).ops.single().opId
        val again = plan(listOf(OutboxEntry("habit", "h1", "name", 1))).ops.single().opId
        val edited = plan(listOf(OutboxEntry("habit", "h1", "name", 2))).ops.single().opId
        assertEquals(first, again)
        assertNotEquals(first, edited)
        assertTrue(Regex("[A-Za-z0-9_.:-]{1,100}").matches(first))
    }
}
