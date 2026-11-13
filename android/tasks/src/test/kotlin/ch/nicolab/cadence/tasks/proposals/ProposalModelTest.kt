package ch.nicolab.cadence.tasks.proposals

import java.time.LocalDate
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ProposalModelTest {
    private val monday = LocalDate.of(2026, 11, 16)
    private val tuesday = monday.plusDays(1)

    private fun change(uid: String, op: ProposalOp, date: LocalDate? = null) = WeekChange(uid, op, date, reason = "raison $uid")

    /** Réponse exacte du contrat `docs/47-proposals.md`, telle que `GET /api/proposals/:uid` la renvoie. */
    private val weekJson = """
        {
          "uid": "p1", "kind": "week", "status": "ready",
          "period_start": "2026-11-16", "period_end": "2026-11-22",
          "answer": {
            "summary": "Mardi est libre ; deux retards replacés.",
            "questions": [{ "id": "q1", "text": "Tu travailles mardi ?", "choices": ["Oui", "Non"] }],
            "changes": [
              { "task_uid": "abc123", "op": "plan_day", "date": "2026-11-17", "reason": "Mardi est libre" },
              { "task_uid": "def456", "op": "later", "reason": "Pas cette semaine" }
            ]
          },
          "facts": {
            "period": { "start": "2026-11-16", "end": "2026-11-22" },
            "today": "2026-11-16",
            "days": [],
            "tasks": [{ "uid": "abc123", "name": "Valider le devis", "due": "2026-11-17", "project": "Cuisine", "priority": "high" }],
            "stamps": { "abc123": "2026-11-10T08:00:00Z" }
          }
        }
    """.trimIndent()

    @Test
    fun `parses the documented week answer and facts`() {
        val dto = ProposalJson.decodeFromString<ProposalDto>(weekJson)

        assertEquals("ready", dto.status)
        assertEquals("Mardi est libre ; deux retards replacés.", dto.answer?.summary)
        assertEquals("Tu travailles mardi ?", dto.answer?.questions?.single()?.text)
        assertEquals(listOf("Oui", "Non"), dto.answer?.questions?.single()?.choices)
        assertEquals("Valider le devis", Proposals.factTasks(dto.facts)["abc123"]?.name)
        assertEquals("Cuisine", Proposals.factTasks(dto.facts)["abc123"]?.project)
    }

    @Test
    fun `changes without a day are grouped first then days in calendar order`() {
        val changes = listOf(
            change("a", ProposalOp.PLAN_DAY, tuesday),
            change("b", ProposalOp.LATER),
            change("c", ProposalOp.PLAN_DAY, monday),
            change("d", ProposalOp.THIS_WEEK),
            change("e", ProposalOp.PLAN_DAY, tuesday),
        )

        val groups = Proposals.groupByDay(changes)

        assertEquals(listOf(null, monday, tuesday), groups.map { it.date })
        assertEquals(listOf("b", "d"), groups[0].changes.map { it.taskUid })
        assertEquals(listOf("c"), groups[1].changes.map { it.taskUid })
        assertEquals(listOf("a", "e"), groups[2].changes.map { it.taskUid })
    }

    @Test
    fun `no undated group when every change has a day`() {
        val groups = Proposals.groupByDay(listOf(change("a", ProposalOp.DUE, monday)))

        assertEquals(listOf<LocalDate?>(monday), groups.map { it.date })
    }

    @Test
    fun `unchecked changes are left out of the apply payload`() {
        val changes = listOf(change("a", ProposalOp.LATER), change("b", ProposalOp.DROP), change("c", ProposalOp.THIS_WEEK))
        val unchecked = Proposals.toggle(emptySet(), "b")

        val body = Proposals.weekApplyBody(changes, unchecked)

        assertEquals(listOf("a", "c"), body["task_uids"]!!.jsonArray.map { it.jsonPrimitive.content })
    }

    @Test
    fun `everything is checked by default and toggling twice restores it`() {
        val changes = listOf(change("a", ProposalOp.LATER), change("b", ProposalOp.DROP))

        assertEquals(2, Proposals.checked(changes, emptySet()).size)
        assertEquals(emptySet<String>(), Proposals.toggle(Proposals.toggle(emptySet(), "a"), "a"))
    }

    @Test
    fun `an unknown operation or a blank task is dropped from the changes`() {
        val answer = ProposalAnswerDto(
            changes = listOf(
                ChangeDto(taskUid = "a", op = "delete_everything"),
                ChangeDto(taskUid = "", op = "later"),
                ChangeDto(taskUid = "b", op = "later"),
            ),
        )

        assertEquals(listOf("b"), Proposals.weekChanges(answer).map { it.taskUid })
    }

    @Test
    fun `review judgements map each task to its choice and reason`() {
        val answer = ProposalAnswerDto(
            items = listOf(
                ReviewItemDto(taskUid = "a", choice = "do_today", reason = "Échéance demain"),
                ReviewItemDto(taskUid = "", choice = "later"),
                ReviewItemDto(taskUid = "b", choice = ""),
            ),
        )

        val judgements = Proposals.reviewJudgements(answer)

        assertEquals(mapOf("a" to ReviewJudgement("a", "do_today", "Échéance demain")), judgements)
    }

    @Test
    fun `judgements are used only for a ready or partly applied review`() {
        val items = ProposalAnswerDto(items = listOf(ReviewItemDto(taskUid = "a", choice = "drop", reason = "Plus d'actualité")))

        assertEquals(1, Proposals.judgementsOf(review("ready", items)).size)
        assertEquals(1, Proposals.judgementsOf(review("applied", items)).size)
        assertTrue(Proposals.judgementsOf(review("pending", items)).isEmpty())
        assertTrue(Proposals.judgementsOf(review("failed", items)).isEmpty())
        assertTrue(Proposals.judgementsOf(null).isEmpty())
    }

    @Test
    fun `review apply body sends one decision per task`() {
        val body = Proposals.reviewApplyBody(listOf(ReviewJudgement("a", "keep", "")))

        val decision = body["decisions"]!!.jsonArray.single().jsonObject
        assertEquals("a", decision["task_uid"]!!.jsonPrimitive.content)
        assertEquals("keep", decision["choice"]!!.jsonPrimitive.content)
    }

    @Test
    fun `a question choice is sent as the question followed by the choice`() {
        val question = QuestionDto(id = "q1", text = " Tu travailles mardi ? ", choices = listOf("Oui"))

        assertEquals("Tu travailles mardi ? Oui", Proposals.questionReply(question, "Oui"))
    }

    @Test
    fun `the button follows the latest proposal and returns to idle after a failure`() {
        assertEquals(ProposalPhase.Idle, ProposalPhase.of(null))
        assertEquals(ProposalPhase.Preparing("p1"), ProposalPhase.of(proposal("pending")))
        assertEquals(ProposalPhase.Ready("p1"), ProposalPhase.of(proposal("ready")))
        assertEquals(ProposalPhase.Idle, ProposalPhase.of(proposal("failed")))
        assertEquals(ProposalPhase.Idle, ProposalPhase.of(proposal("applied")))
    }

    @Test
    fun `apply outcome counts applied and failed changes`() {
        val body = ProposalJson.decodeFromString<kotlinx.serialization.json.JsonObject>(
            """{"uid":"p1","status":"applied","results":[{"task_uid":"a","state":"applied"},{"task_uid":"b","state":"failed","error":"x"},{"task_uid":"c","state":"applied"}]}""",
        )

        assertEquals(ApplyOutcome(applied = 2, failed = 1), Proposals.applyOutcome(body))
    }

    @Test
    fun `an unknown kind or status is not a proposal the app shows`() {
        assertNull(ProposalKind.of("weekly"))
        assertNull(ProposalStatus.of("stuck"))
        assertEquals(ProposalStatus.READY, ProposalStatus.of("ready"))
    }

    @Test
    fun `a finished week opens the sheet, a failed one opens Planifier, a pending one notifies nothing`() {
        assertEquals(ProposalNotifications.ROUTE_SHOW, ProposalNotifications.present("week", "ready")?.route)
        assertEquals(ProposalNotifications.ROUTE_PLAN, ProposalNotifications.present("week", "failed")?.route)
        assertEquals(ProposalNotifications.ROUTE_REVIEW, ProposalNotifications.present("review", "ready")?.route)
        assertNull(ProposalNotifications.present("week", "pending"))
    }

    private fun proposal(status: String) = ProposalDto(uid = "p1", kind = "week", status = status)

    private fun review(status: String, answer: ProposalAnswerDto) = ProposalDto(uid = "r1", kind = "review", status = status, answer = answer)
}
