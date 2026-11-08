package ch.nicolab.cadence.tasks.model

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class FunnelTest {
    private val saturday = LocalDate.of(2026, 10, 31)
    private val zone = ZoneId.of("Europe/Zurich")

    @Test
    fun `the week starts on the account's first day`() {
        assertEquals(LocalDate.of(2026, 10, 26), Funnel.weekStart(saturday, DayOfWeek.MONDAY))
        assertEquals(LocalDate.of(2026, 10, 25), Funnel.weekStart(saturday, DayOfWeek.SUNDAY))
        assertEquals(saturday, Funnel.weekStart(saturday, DayOfWeek.SATURDAY))
    }

    @Test
    fun `server first day of week is 0 for Sunday`() {
        assertEquals(DayOfWeek.SUNDAY, Funnel.firstDayOf(0))
        assertEquals(DayOfWeek.MONDAY, Funnel.firstDayOf(1))
        assertEquals(DayOfWeek.SATURDAY, Funnel.firstDayOf(6))
        assertEquals(DayOfWeek.MONDAY, Funnel.firstDayOf(null))
        assertEquals(DayOfWeek.MONDAY, Funnel.firstDayOf(9))
    }

    @Test
    fun `stage of a task`() {
        val week = LocalDate.of(2026, 10, 26)
        assertEquals(FunnelStage.LATER, Funnel.stage(TaskItem("a", "a", someday = true, weekOf = week), week))
        assertEquals(FunnelStage.THIS_WEEK, Funnel.stage(TaskItem("b", "b", weekOf = week, inViewAt = Instant.EPOCH), week))
        assertEquals(FunnelStage.IN_VIEW, Funnel.stage(TaskItem("c", "c", weekOf = week.minusWeeks(1), inViewAt = Instant.EPOCH), week))
        assertNull(Funnel.stage(TaskItem("d", "d"), week))
    }

    private val ctx = DecisionContext(today = saturday, weekStart = LocalDate.of(2026, 10, 26), zone = zone)

    @Test
    fun `review decisions stamp the review, detail chips do not`() {
        val task = TaskItem("t", "t")
        assertTrue(ReviewDecisions.change(Decision.Keep, task, ctx).reviewed)
        assertFalse(ReviewDecisions.toggle(FunnelStage.IN_VIEW, task, ctx).reviewed)
    }

    @Test
    fun `this week and in view take a parked task back out`() {
        val task = TaskItem("t", "t", someday = true, reviewOn = LocalDate.of(2026, 11, 1))
        val week = ReviewDecisions.change(Decision.ThisWeek, task, ctx)
        assertEquals(LocalDate.of(2026, 10, 26), week.weekOf)
        assertEquals(false, week.later)
        assertTrue(week.clearReviewOn)
        val view = ReviewDecisions.change(Decision.InView, task, ctx)
        assertEquals(true, view.inView)
        assertEquals(false, view.later)
        assertTrue(view.clearReviewOn)
    }

    @Test
    fun `parking, dropping and dates`() {
        val task = TaskItem("t", "t")
        assertEquals(true, ReviewDecisions.change(Decision.Later, task, ctx).later)
        assertEquals(TaskStatus.CANCELLED, ReviewDecisions.change(Decision.Drop, task, ctx).status)
        assertEquals(saturday.plusDays(30), ReviewDecisions.change(Decision.ReviewIn30Days, task, ctx).reviewOn)
        assertEquals(LocalDate.of(2027, 1, 4), ReviewDecisions.change(Decision.ReviewOn(LocalDate.of(2027, 1, 4)), task, ctx).reviewOn)
        assertTrue(ReviewDecisions.change(Decision.KeepParked, task, ctx).clearReviewOn)
        assertTrue(ReviewDecisions.change(Decision.NotThisWeek, task, ctx).clearWeek)
        assertEquals(false, ReviewDecisions.change(Decision.OutOfView, task, ctx).inView)
    }

    @Test
    fun `today sets the due day and keeps a fixed time`() {
        val timed = TaskItem("t", "t", dueDate = Instant.parse("2026-10-28T13:30:00Z"), dueHasTime = true)
        val change = ReviewDecisions.change(Decision.Today, timed, ctx)
        assertEquals(saturday, change.dueDate)
        assertEquals("14:30", change.dueTime)
        assertTrue(change.reviewed)
    }

    @Test
    fun `chips toggle the stage on and off`() {
        val week = LocalDate.of(2026, 10, 26)
        val inWeek = TaskItem("t", "t", weekOf = week)
        assertTrue(ReviewDecisions.toggle(FunnelStage.THIS_WEEK, inWeek, ctx).clearWeek)
        assertEquals(week, ReviewDecisions.toggle(FunnelStage.THIS_WEEK, TaskItem("u", "u"), ctx).weekOf)
        assertEquals(false, ReviewDecisions.toggle(FunnelStage.LATER, TaskItem("p", "p", someday = true), ctx).later)
        assertEquals(true, ReviewDecisions.toggle(FunnelStage.LATER, TaskItem("q", "q"), ctx).later)
        assertEquals(false, ReviewDecisions.toggle(FunnelStage.IN_VIEW, TaskItem("v", "v", inViewAt = Instant.EPOCH), ctx).inView)
    }

    @Test
    fun `choosing this week settles a task that waits for its when`() {
        val waiting = TaskItem("w", "w", areaUid = "domaine", needsWhen = true)

        assertEquals(false, ReviewDecisions.toggle(FunnelStage.THIS_WEEK, waiting, ctx).needsWhen)
        assertEquals(false, ReviewDecisions.change(Decision.ThisWeek, waiting, ctx).needsWhen)
        assertEquals(false, ReviewDecisions.toggle(FunnelStage.LATER, waiting, ctx).needsWhen)
    }
}
