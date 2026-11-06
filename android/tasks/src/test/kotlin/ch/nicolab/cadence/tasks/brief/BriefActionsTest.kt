package ch.nicolab.cadence.tasks.brief

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.sync.DeferredCall
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
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
    private val plan = FakePlan()
    private val actions = BriefActions(tasks, queue, { zone }, plan, newKey = { "k1" })

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

        actions.move(today, move(to = "2026-11-07"), task, LocalDate.of(2026, 11, 7))

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

        val undo = actions.move(today, move(to = "2026-11-07"), task, LocalDate.of(2026, 11, 7))
        undo()

        assertEquals(listOf("brief-decision:k1"), queue.cancelled)
        assertEquals(today, tasks.writes.last().second.dueDate)
    }

    @Test
    fun settingADueDayWritesItAndUndoRestoresTheOldOne() = runTest {
        val task = TaskItem(uid = "t3", name = "Appeler", dueDay = today)

        val undo = actions.setDue(task, LocalDate.of(2026, 11, 6))
        assertEquals(LocalDate.of(2026, 11, 6), tasks.writes.single().second.dueDate)
        undo()

        assertEquals(today, tasks.writes.last().second.dueDate)
        assertTrue(queue.queued.isEmpty())
    }

    @Test
    fun undoingADueDayOnATaskWithoutOneClearsIt() = runTest {
        val task = TaskItem(uid = "t3", name = "Appeler")

        actions.setDue(task, LocalDate.of(2026, 11, 6))()

        assertTrue(tasks.writes.last().second.clearDue)
    }

    @Test
    fun laterTagsTheTaskAndUndoRemovesTheTagOnlyIfItWasNotThere() = runTest {
        actions.later(TaskItem(uid = "t4", name = "Ranger"))()
        assertEquals(listOf(true, false), tasks.writes.map { it.second.later })

        tasks.writes.clear()
        actions.later(TaskItem(uid = "t5", name = "Ranger", someday = true))()
        assertEquals(listOf<Boolean?>(true), tasks.writes.map { it.second.later })
    }

    @Test
    fun abandoningCancelsTheTaskAndUndoRestoresThePreviousStatus() = runTest {
        val task = TaskItem(uid = "t6", name = "Vieux", status = ch.nicolab.cadence.tasks.model.TaskStatus.IN_PROGRESS)

        val undo = actions.abandon(task)
        assertEquals(ch.nicolab.cadence.tasks.model.TaskStatus.CANCELLED, tasks.writes.single().second.status)
        undo()

        assertEquals(ch.nicolab.cadence.tasks.model.TaskStatus.IN_PROGRESS, tasks.writes.last().second.status)
    }

    @Test
    fun movingToAnotherDayWritesThatDayAndRecordsIt() = runTest {
        val chosen = LocalDate.of(2026, 11, 20)

        actions.move(today, move(to = "2026-11-07"), TaskItem(uid = "t1", name = "Payer"), chosen)

        assertEquals(listOf("t1"), tasks.writes.map { it.first })
        val call = queue.queued.single()
        assertEquals("accepted", call.body.str("decision"))
        assertEquals("2026-11-20", call.body.obj("proposal").str("to"))
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

        val task = TaskItem(uid = "t1", name = "Payer")
        keyed.move(today, move(to = "2026-11-07"), task, LocalDate.of(2026, 11, 7))
        keyed.move(today, move(to = "2026-11-08"), task, LocalDate.of(2026, 11, 8))

        assertEquals(listOf("brief-decision:key0", "brief-decision:key1"), queue.queued.map { it.key })
    }

    @Test
    fun carryOverQueuesOneCallForTomorrowsPlan() = runTest {
        val tomorrow = today.plusDays(1)

        actions.carryOver(tomorrow, listOf("t1", "t2"))

        val call = queue.queued.single()
        assertEquals("POST", call.method)
        assertEquals("/api/v1/daily-plan/2026-11-05/carry-over", call.path)
        assertEquals("brief-carry:k1", call.key)
        assertEquals(listOf("t1", "t2"), (call.body!!["task_uids"] as JsonArray).map { it.jsonPrimitive.content })
        assertTrue(tasks.writes.isEmpty())
    }

    @Test
    fun undoOfACarryOverBeforeItLeftOnlyCancelsTheCall() = runTest {
        val undo = actions.carryOver(today.plusDays(1), listOf("t1"))

        undo()

        assertEquals(listOf("brief-carry:k1"), queue.cancelled)
        assertTrue(plan.removed.isEmpty())
    }

    @Test
    fun undoOfACarryOverThatAlreadyLeftTakesTheTasksOffTomorrowsPlan() = runTest {
        queue.sent += "brief-carry:k1"
        val undo = actions.carryOver(today.plusDays(1), listOf("t1"))

        undo()

        assertEquals(listOf(today.plusDays(1) to listOf("t1")), plan.removed)
    }

    @Test
    fun planWithoutKeepsTheOtherLinesAsTheyAre() {
        val response = Json.parseToJsonElement(
            """{"date":"2026-11-05","plan":{"items":[
              {"task_uid":"a","position":0,"start_minute":null,"duration_minutes":null,"task":{"uid":"a"}},
              {"task_uid":"b","position":1,"start_minute":600,"duration_minutes":30}]}}""",
        ) as JsonObject

        val body = BriefRequests.planWithout(response, listOf("a"))!!

        val items = body["items"] as JsonArray
        assertEquals(1, items.size)
        assertEquals("b", (items[0] as JsonObject).str("task_uid"))
        assertEquals("600", (items[0] as JsonObject).str("start_minute"))
        assertEquals("30", (items[0] as JsonObject).str("duration_minutes"))
        assertEquals(null, BriefRequests.planWithout(response, listOf("zzz")))
        assertEquals(null, BriefRequests.planWithout(JsonObject(emptyMap()), listOf("a")))
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

    /** Les clés de [sent] sont déjà parties : l'annulation n'y trouve rien. */
    val sent = mutableSetOf<String>()

    override suspend fun cancel(key: String): Boolean {
        cancelled += key
        return key !in sent
    }
}

private class FakePlan : BriefPlanWrites {
    val removed = mutableListOf<Pair<LocalDate, List<String>>>()

    override suspend fun removeFromPlan(date: LocalDate, taskUids: List<String>) {
        removed += date to taskUids
    }
}
