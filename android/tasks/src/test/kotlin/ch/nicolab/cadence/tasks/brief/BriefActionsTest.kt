package ch.nicolab.cadence.tasks.brief

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.sync.DeferredCall
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BriefActionsTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val today = LocalDate.of(2026, 11, 4)
    private val tasks = FakeTasks()
    private val queue = FakeQueue()
    private val actions = BriefActions(tasks, queue, { zone }, newKey = { "k1" })

    @Test
    fun completeWritesTheTaskAndUndoReopensIt() = runTest {
        val undo = actions.complete("t1")

        assertEquals(listOf("complete:t1"), tasks.log)
        undo()
        assertEquals(listOf("complete:t1", "reopen:t1"), tasks.log)
        assertTrue(queue.queued.isEmpty())
    }

    @Test
    fun moveChangesTheDueDayAndQueuesAnAcceptedDecision() = runTest {
        val task = TaskItem(uid = "t2", name = "Trier", dueDay = today)

        actions.move(today, move(to = "2026-11-07"), task)

        assertEquals(LocalDate.of(2026, 11, 7), tasks.writes.single().second.dueDate)
        val call = queue.queued.single()
        assertEquals("POST", call.method)
        assertEquals("/api/v1/daily-plan/2026-11-04/brief/decisions", call.path)
        assertEquals("accepted", call.body.str("decision"))
        assertEquals("move", call.body.str("kind"))
        assertEquals("task", call.body.str("target_type"))
        assertEquals("t2", call.body.str("target_ref"))
        assertEquals("k1", call.body.str("idempotency_key"))
        assertEquals("brief-decision:k1", call.key)
    }

    @Test
    fun undoOfAMoveRestoresTheDayAndCancelsTheQueuedCall() = runTest {
        val task = TaskItem(uid = "t2", name = "Trier", dueDay = today)

        val undo = actions.move(today, move(to = "2026-11-07"), task)
        undo()

        assertEquals(listOf("brief-decision:k1"), queue.cancelled)
        assertEquals(today, tasks.writes.last().second.dueDate)
    }

    @Test
    fun refusingADateOnlyQueuesARefusedDecision() = runTest {
        actions.refuseMove(today, move(to = "2026-11-07"))

        assertTrue(tasks.writes.isEmpty())
        val call = queue.queued.single()
        assertEquals("refused", call.body.str("decision"))
        assertEquals("2026-11-07", call.body.obj("proposal").str("to"))
    }

    @Test
    fun answerQueuesOneCallWithTheTargetAndTheAnswer() = runTest {
        val question = QuestionDto(key = "q1", text = "Garage ?", target = TargetDto(scope = "event", ref = "event:f:e:2026"))

        actions.answer(today, question, "yes")

        val call = queue.queued.single()
        assertEquals("/api/v1/daily-plan/2026-11-04/brief/answers", call.path)
        assertEquals("brief-answer:k1", call.key)
        assertEquals("q1", call.body.str("question_key"))
        assertEquals("event", call.body.obj("target").str("scope"))
        assertEquals("event:f:e:2026", call.body.obj("target").str("ref"))
        assertEquals("yes", call.body.str("answer"))
        assertEquals("k1", call.body.str("idempotency_key"))
    }

    @Test
    fun feedbackCarriesTheCardTypeAndTheVote() = runTest {
        val card = AnticipateDto(key = "k9", type = "overload", text = "Trop")

        actions.feedback(today, card, "noise")

        val call = queue.queued.single()
        assertEquals("feedback", call.body.str("kind"))
        assertEquals("card", call.body.str("target_type"))
        assertEquals("overload", call.body.obj("proposal").str("card_type"))
        assertEquals("noise", call.body.obj("proposal").str("vote"))
    }

    @Test
    fun everyActionUsesItsOwnIdempotencyKey() = runTest {
        var next = 0
        val keyed = BriefActions(tasks, queue, { zone }, newKey = { "key${next++}" })

        keyed.refuseMove(today, move(to = "2026-11-07"))
        keyed.refuseMove(today, move(to = "2026-11-08"))

        assertEquals(listOf("brief-decision:key0", "brief-decision:key1"), queue.queued.map { it.key })
    }

    private fun move(to: String) = MoveDto(proposalKey = "m1", taskUid = "t2", from = "2026-11-04", to = to, reason = "")

    private fun JsonObject?.str(key: String): String = this!![key]!!.jsonPrimitive.content

    private fun JsonObject?.obj(key: String): JsonObject = this!![key] as JsonObject
}

private class FakeTasks : BriefTaskWrites {
    val log = mutableListOf<String>()
    val writes = mutableListOf<Pair<String, TaskChange>>()

    override suspend fun complete(uid: String) {
        log += "complete:$uid"
    }

    override suspend fun reopen(uid: String) {
        log += "reopen:$uid"
    }

    override suspend fun write(uid: String, change: TaskChange) {
        writes += uid to change
    }
}

private class FakeQueue : BriefQueue {
    val queued = mutableListOf<DeferredCall>()
    val cancelled = mutableListOf<String>()

    override suspend fun enqueue(call: DeferredCall) {
        queued += call
    }

    override suspend fun cancel(key: String) {
        cancelled += key
    }
}
