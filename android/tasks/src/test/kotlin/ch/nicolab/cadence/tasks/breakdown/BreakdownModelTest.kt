package ch.nicolab.cadence.tasks.breakdown

import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.sync.HttpError
import ch.nicolab.cadence.tasks.sync.ProtocolError
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BreakdownModelTest {
    private fun response(json: String) = Json.parseToJsonElement(json) as JsonObject

    private fun draftOf(vararg steps: Pair<String, Int>) = BreakdownProposal(
        ai = true,
        reason = null,
        steps = steps.map { ProposedStep(it.first, it.second) },
    ).let(Breakdown::draftOf)

    @Test
    fun anAiAnswerIsReadStepByStep() {
        val proposal = BreakdownProposal.parse(
            response("""{"source":"ai","reason":null,"steps":[{"name":"Ouvrir le dossier","minutes":5},{"name":"Trier","minutes":25}],"total_minutes":30}"""),
        )

        assertTrue(proposal.ai)
        assertNull(proposal.reason)
        assertEquals(listOf(ProposedStep("Ouvrir le dossier", 5), ProposedStep("Trier", 25)), proposal.steps)
    }

    @Test
    fun aFallbackAnswerCarriesItsReason() {
        val reasons = mapOf(
            "disabled" to BreakdownReason.DISABLED,
            "not_configured" to BreakdownReason.NOT_CONFIGURED,
            "failed" to BreakdownReason.FAILED,
            "empty" to BreakdownReason.EMPTY,
        )
        reasons.forEach { (wire, reason) ->
            val proposal = BreakdownProposal.parse(response("""{"source":"fallback","reason":"$wire","steps":[],"total_minutes":0}"""))
            assertFalse(proposal.ai)
            assertEquals(reason, proposal.reason)
        }
    }

    @Test
    fun anUnreadableAnswerIsAFallbackNotACrash() {
        val proposal = BreakdownProposal.parse(response("""{"steps":[{"minutes":5},{"name":"  ","minutes":5},{"name":"Un","minutes":"x"}]}"""))

        assertFalse(proposal.ai)
        assertEquals(BreakdownReason.FAILED, proposal.reason)
        assertTrue(proposal.steps.isEmpty())
    }

    @Test
    fun aFallbackDraftOffersOneEmptyFirstStepOfFiveMinutes() {
        val draft = Breakdown.draftOf(BreakdownProposal(false, BreakdownReason.DISABLED, emptyList()))

        assertTrue(draft.fallback)
        assertEquals(BreakdownReason.DISABLED, draft.reason)
        assertEquals(1, draft.steps.size)
        assertEquals("", draft.steps.single().name)
        assertEquals("5", draft.steps.single().minutes)
        assertEquals(0, Breakdown.count(draft))
        assertFalse(Breakdown.canApply(draft))
    }

    @Test
    fun anAiDraftKeepsTheStepsInOrderWithUniqueKeys() {
        val draft = draftOf("A" to 5, "B" to 10, "C" to 15)

        assertFalse(draft.fallback)
        assertEquals(listOf("A", "B", "C"), draft.steps.map { it.name })
        assertEquals(3, draft.steps.map { it.key }.toSet().size)
        assertEquals(30, Breakdown.total(draft))
        assertEquals(3, Breakdown.count(draft))
    }

    @Test
    fun movingAStepSwapsItWithItsNeighbourAndStopsAtTheEnds() {
        val draft = draftOf("A" to 5, "B" to 10, "C" to 15)
        val (a, b, c) = draft.steps.map { it.key }

        assertEquals(listOf("B", "A", "C"), Breakdown.move(draft, a, 1).steps.map { it.name })
        assertEquals(listOf("A", "C", "B"), Breakdown.move(draft, c, -1).steps.map { it.name })
        assertEquals(draft, Breakdown.move(draft, a, -1))
        assertEquals(draft, Breakdown.move(draft, c, 1))
        assertEquals(draft, Breakdown.move(draft, 999L, 1))
        assertEquals(listOf("A", "B", "C"), Breakdown.move(draft, b, 0).steps.map { it.name })
    }

    @Test
    fun removingAStepKeepsTheOthers() {
        val draft = draftOf("A" to 5, "B" to 10)
        val removed = Breakdown.remove(draft, draft.steps.first().key)

        assertEquals(listOf("B"), removed.steps.map { it.name })
        assertEquals(10, Breakdown.total(removed))
    }

    @Test
    fun addingAStepAppendsABlankFiveMinuteStepWithAFreshKey() {
        val draft = draftOf("A" to 5)
        val added = Breakdown.add(draft)

        assertEquals(2, added.steps.size)
        assertEquals("", added.steps.last().name)
        assertEquals("5", added.steps.last().minutes)
        assertEquals(2, added.steps.map { it.key }.toSet().size)
        assertEquals(1, Breakdown.count(added))
        // Une suppression puis un ajout ne réutilise jamais une clé.
        val again = Breakdown.add(Breakdown.remove(added, added.steps.last().key))
        assertTrue(again.steps.last().key != added.steps.last().key)
    }

    @Test
    fun addingStopsAtFiftySteps() {
        var draft = draftOf("A" to 5)
        repeat(60) { draft = Breakdown.add(draft) }

        assertEquals(Breakdown.MAX_STEPS, draft.steps.size)
    }

    @Test
    fun editingNameAndMinutesTouchesOnlyThatStep() {
        val draft = draftOf("A" to 5, "B" to 10)
        val edited = Breakdown.setMinutes(Breakdown.rename(draft, draft.steps[1].key, "Nouveau"), draft.steps[0].key, "20")

        assertEquals(listOf("A", "Nouveau"), edited.steps.map { it.name })
        assertEquals(listOf("20", "10"), edited.steps.map { it.minutes })
    }

    @Test
    fun theTotalCountsOnlyNamedStepsWithValidMinutes() {
        var draft = draftOf("A" to 5, "B" to 10, "C" to 15)
        draft = Breakdown.rename(draft, draft.steps[2].key, "   ")
        draft = Breakdown.setMinutes(draft, draft.steps[1].key, "abc")

        assertEquals(5, Breakdown.total(draft))
        assertEquals(2, Breakdown.count(draft))
    }

    @Test
    fun minutesOutsideFiveToSevenHundredTwentyAreRefused() {
        listOf("4", "721", "-5", "0", "1,5", "abc").forEach { bad ->
            val draft = Breakdown.setMinutes(draftOf("A" to 5), draftOf("A" to 5).steps.single().key, bad)
            assertEquals(Breakdown.StepIssue.MINUTES, Breakdown.issueOf(draft.steps.single()), bad)
            assertFalse(Breakdown.canApply(draft), bad)
        }
        listOf("5", "720", " 30 ").forEach { good ->
            val draft = Breakdown.setMinutes(draftOf("A" to 5), draftOf("A" to 5).steps.single().key, good)
            assertNull(Breakdown.issueOf(draft.steps.single()), good)
            assertTrue(Breakdown.canApply(draft), good)
        }
    }

    @Test
    fun blankMinutesMeanNoEstimateAndAreSentAsNull() {
        val draft = draftOf("A" to 5).let { Breakdown.setMinutes(it, it.steps.single().key, "  ") }
        val body = Breakdown.applyBody(draft).getOrThrow()

        assertNull(Breakdown.issueOf(draft.steps.single()))
        assertEquals("null", body.getValue("steps").jsonArray.single().jsonObject.getValue("minutes").toString())
        assertEquals(0, Breakdown.total(draft))
    }

    @Test
    fun aNameOverTwoHundredCharactersIsRefused() {
        val draft = draftOf("A" to 5).let { Breakdown.rename(it, it.steps.single().key, "x".repeat(201)) }

        assertEquals(Breakdown.StepIssue.NAME, Breakdown.issueOf(draft.steps.single()))
        assertFalse(Breakdown.canApply(draft))
        assertTrue(Breakdown.applyBody(draft).isFailure)
        assertTrue(Breakdown.canApply(Breakdown.rename(draft, draft.steps.single().key, "x".repeat(200))))
    }

    @Test
    fun theApplyBodyKeepsOrderTrimsNamesAndSkipsBlankSteps() {
        var draft = draftOf("  Ouvrir  " to 5, "Trier" to 25)
        draft = Breakdown.add(draft)
        val body = Breakdown.applyBody(draft).getOrThrow()
        val steps = body.getValue("steps").jsonArray.map { it.jsonObject }

        assertEquals(listOf("Ouvrir", "Trier"), steps.map { it.getValue("name").jsonPrimitive.content })
        assertEquals(listOf("5", "25"), steps.map { it.getValue("minutes").jsonPrimitive.content })
    }

    @Test
    fun nothingToApplyWithoutANamedStep() {
        assertTrue(Breakdown.applyBody(Breakdown.draftOf(BreakdownProposal(false, BreakdownReason.EMPTY, emptyList()))).isFailure)
    }

    @Test
    fun onlyTopLevelServerOwnedTasksCanBeSplit() {
        val base = TaskItem(uid = "t", name = "Déclaration d'impôts")

        assertTrue(Breakdown.canBreakDown(base))
        assertFalse(Breakdown.canBreakDown(base.copy(parentTaskUid = "p")))
        assertFalse(Breakdown.canBreakDown(base.copy(fileBacked = true)))
        assertFalse(Breakdown.canBreakDown(base.copy(virtual = true)))
    }

    @Test
    fun theReasonLineIsOnlyForAFallback() {
        assertEquals(BreakdownReason.FAILED, Breakdown.draftOf(BreakdownProposal(false, BreakdownReason.FAILED, emptyList())).reason)
        assertNull(draftOf("A" to 5).reason)
    }

    @Test
    fun aNetworkFailureMeansOfflineButAServerAnswerDoesNot() {
        assertEquals(BreakdownFailure.OFFLINE, Breakdown.failureOf(java.net.UnknownHostException("x")))
        assertEquals(BreakdownFailure.OFFLINE, Breakdown.failureOf(java.net.SocketTimeoutException("x")))
        assertEquals(BreakdownFailure.REFUSED, Breakdown.failureOf(HttpError(403, "forbidden")))
        assertEquals(BreakdownFailure.REFUSED, Breakdown.failureOf(HttpError(400, "A subtask cannot be split into steps")))
        assertEquals(BreakdownFailure.FAILED, Breakdown.failureOf(HttpError(500, null)))
        assertEquals(BreakdownFailure.FAILED, Breakdown.failureOf(ProtocolError()))
        assertEquals(BreakdownFailure.FAILED, Breakdown.failureOf(IllegalStateException("x")))
    }
}
