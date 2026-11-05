package ch.nicolab.cadence.tasks.ui.brief

import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BriefPendingTest {
    private val thursday = LocalDate.of(2026, 11, 5)

    @Test
    fun aTapShowsTheRowCompletedAtOnceAndUndoRestoresIt() {
        val done = BriefPending().complete("t1")

        assertTrue(done.isCompleting("t1"))
        assertFalse(done.isCompleting("t2"))
        assertEquals(BriefPending(), done.uncomplete("t1"))
    }

    @Test
    fun movingACardCollapsesItToTheChosenDayAndUndoOpensItAgain() {
        val moved = BriefPending().move("m1", thursday)

        assertEquals(thursday, moved.moved["m1"])
        assertTrue(moved.refused.isEmpty())
        assertEquals(BriefPending(), moved.unmove("m1"))
    }

    @Test
    fun refusingADateReplacesAMoveOnTheSameCardAndTheOtherWayAround() {
        val refused = BriefPending().move("m1", thursday).refuse("m1")

        assertTrue("m1" in refused.refused)
        assertTrue(refused.moved.isEmpty())
        val moved = refused.move("m1", thursday)
        assertTrue(moved.refused.isEmpty())
        assertEquals(thursday, moved.moved["m1"])
    }

    @Test
    fun answersAndFeedbackAreKeptPerCardAndUndone() {
        val pending = BriefPending().answer("q1", "yes").vote("c1", "noise").vote("c2", "useful")

        assertEquals("yes", pending.answers["q1"])
        assertEquals(mapOf("c1" to "noise", "c2" to "useful"), pending.feedback)
        val undone = pending.unanswer("q1").unvote("c1")
        assertTrue(undone.answers.isEmpty())
        assertEquals(mapOf("c2" to "useful"), undone.feedback)
    }

    @Test
    fun carryingAndUncarryingWorkOnLists() {
        val carried = BriefPending().carry(listOf("a", "b", "c")).uncarry(listOf("b"))

        assertEquals(setOf("a", "c"), carried.carried)
    }

    @Test
    fun decisionsSurviveARestartButARowInTheMiddleOfCompletingDoesNot() {
        val pending = BriefPending()
            .complete("t1")
            .move("m1", thursday)
            .refuse("m2")
            .answer("q1", "Chez le garagiste")
            .vote("c1", "useful")
            .carry(listOf("t9"))

        val restored = BriefPending.fromLasting(pending.lasting())

        assertEquals(pending.copy(completing = emptySet()), restored)
    }

    @Test
    fun unreadableStoredEntriesAreIgnored() {
        val restored = BriefPending.fromLasting(mapOf("move:m1" to "pas une date", "inconnu:x" to "1", "answer:q" to "no"))

        assertEquals(BriefPending(answers = mapOf("q" to "no")), restored)
    }

    @Test
    fun eachEveningActionShowsItsLabelAtOnceAndUndoClearsIt() {
        val due = BriefPending().decide("t1", RowOutcome.Due(thursday))
        val later = BriefPending().decide("t1", RowOutcome.Later)
        val dropped = BriefPending().decide("t1", RowOutcome.Abandoned)
        val tomorrow = BriefPending().carry(listOf("t1"))

        assertEquals(RowOutcome.Due(thursday), due.outcome("t1"))
        assertEquals(RowOutcome.Later, later.outcome("t1"))
        assertEquals(RowOutcome.Abandoned, dropped.outcome("t1"))
        assertEquals(RowOutcome.Tomorrow, tomorrow.outcome("t1"))
        assertEquals(null, due.outcome("t2"))
        assertEquals(BriefPending(), due.undecide("t1"))
        assertEquals(BriefPending(), tomorrow.uncarry(listOf("t1")))
    }

    @Test
    fun eveningOutcomesSurviveAReopenAndTheDueLabelReadsLikeTheDesign() {
        val pending = BriefPending().decide("a", RowOutcome.Due(thursday)).decide("b", RowOutcome.Later).decide("c", RowOutcome.Abandoned)

        assertEquals(pending, BriefPending.fromLasting(pending.lasting()))
        assertEquals("jeu 5", BriefFormat.dueChip(thursday))
    }
}
