package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.tasks.sync.DeferredCall
import java.time.LocalDate
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Les écritures du plan : appels `PATCH /api/v1/daily-plan/:date`, miroir local et annulation. */
class PlanEditsTest {
    private val today = LocalDate.of(2026, 11, 12)
    private val tomorrow = today.plusDays(1)

    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)

    @Test
    fun `chaque écriture du plan part en PATCH sur son jour, sans champ d'échéance`() {
        val add = AddTask(tomorrow, "a").call("k1")
        assertEquals("PATCH", add.method)
        assertEquals("/api/v1/daily-plan/2026-11-13", add.path)
        assertEquals(json("""{"ops":[{"op":"add","task_uid":"a"}]}"""), add.body)

        val move = MoveTask(today, "a", tomorrow).call("k2")
        assertEquals("/api/v1/daily-plan/2026-11-12", move.path)
        assertEquals(json("""{"ops":[{"op":"move","task_uid":"a","to_date":"2026-11-13"}]}"""), move.body)

        val slot = SlotTask(today, "a", 545, 30).call("k3")
        assertEquals(json("""{"ops":[{"op":"slot","task_uid":"a","start_minute":545,"duration_minutes":30}]}"""), slot.body)
    }

    @Test
    fun `un déplacement local garde la durée et laisse la ligne déjà là à sa place`() {
        val planned = listOf(PlanEntry("a", today, null, 25), PlanEntry("c", today, 600, 30))
        assertEquals(
            listOf(PlanEntry("c", today, 600, 30), PlanEntry("a", tomorrow, null, 25)),
            planned.applying(MoveTask(today, "a", tomorrow)),
        )
        assertEquals(planned, planned.applying(MoveTask(tomorrow, "zz", today)))
    }

    @Test
    fun `un ajout local pose la ligne sans heure, un créneau pose heure et durée`() {
        assertEquals(listOf(PlanEntry("b", tomorrow, null, null)), emptyList<PlanEntry>().applying(AddTask(tomorrow, "b")))
        assertEquals(
            listOf(PlanEntry("a", today, 545, 30)),
            listOf(PlanEntry("a", today, null, 25)).applying(SlotTask(today, "a", 545, 30)),
        )
    }

    @Test
    fun `annuler avant l'envoi retire l'appel et remet le plan local`() = runTest {
        val fake = FakePlan(listOf(PlanEntry("a", today, null, 25)))
        val undo = fake.edits.apply(listOf(MoveTask(today, "a", tomorrow)))
        assertEquals(listOf(PlanEntry("a", tomorrow, null, 25)), fake.entries)

        undo()

        assertEquals(listOf(PlanEntry("a", today, null, 25)), fake.entries)
        fake.send()
        assertTrue(fake.sent.isEmpty(), "rien ne part : l'appel n'était pas encore envoyé")
    }

    @Test
    fun `annuler après l'envoi renvoie l'inverse, le déplacement retour puis le créneau d'origine`() = runTest {
        val fake = FakePlan(listOf(PlanEntry("a", today, 545, 30)))
        val undo = fake.edits.apply(listOf(MoveTask(today, "a", tomorrow)))
        fake.send()

        undo()
        fake.send()

        assertEquals(listOf(PlanEntry("a", today, 545, 30)), fake.entries)
        assertEquals(
            listOf(
                "/api/v1/daily-plan/2026-11-12" to json("""{"ops":[{"op":"move","task_uid":"a","to_date":"2026-11-13"}]}"""),
                "/api/v1/daily-plan/2026-11-13" to json("""{"ops":[{"op":"move","task_uid":"a","to_date":"2026-11-12"}]}"""),
                "/api/v1/daily-plan/2026-11-12" to json("""{"ops":[{"op":"slot","task_uid":"a","start_minute":545,"duration_minutes":30}]}"""),
            ),
            fake.sent.map { it.path to it.body },
        )
    }

    @Test
    fun `ranger une ligne la pose avant une autre, et l'annulation la remet devant sa voisine d'avant`() = runTest {
        val start = listOf(PlanEntry("a", today, null, 30), PlanEntry("b", today, null, 30), PlanEntry("c", today, null, 30), PlanEntry("z", tomorrow, null, 30))
        val fake = FakePlan(start)
        val undo = fake.edits.apply(listOf(ReorderTask(today, "c", "a")))
        assertEquals(listOf("c", "a", "b", "z"), fake.entries.map { it.uid })
        assertEquals(json("""{"ops":[{"op":"reorder","task_uid":"c","before_uid":"a"}]}"""), fake.queue.single().body)
        fake.send()

        undo()

        assertEquals(start, fake.entries)
        assertEquals(json("""{"ops":[{"op":"reorder","task_uid":"c","before_uid":null}]}"""), fake.queue.single().body)
    }

    @Test
    fun `un ajout avant une ligne se place devant elle et part avec before_uid`() {
        val plan = listOf(PlanEntry("a", today, null, 30), PlanEntry("b", today, null, 30))
        assertEquals(listOf("a", "n", "b"), plan.applying(AddTask(today, "n", beforeUid = "b")).map { it.uid })
        assertEquals(json("""{"ops":[{"op":"add","task_uid":"n","before_uid":"b"}]}"""), AddTask(today, "n", "b").call("k").body)
    }

    private class FakePlan(initial: List<PlanEntry>) {
        var entries = initial
        val queue = mutableListOf<DeferredCall>()
        val sent = mutableListOf<DeferredCall>()
        private var counter = 0
        val edits = PlanEdits(
            read = { entries },
            write = { entries = it },
            defer = { call -> queue += call },
            cancel = { key -> queue.removeAll { it.key == key } },
            newKey = { "key-${counter++}" },
        )

        fun send() {
            sent += queue
            queue.clear()
        }
    }
}
