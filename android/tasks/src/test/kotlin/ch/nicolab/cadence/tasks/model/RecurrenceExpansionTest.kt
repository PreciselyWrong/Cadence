package ch.nicolab.cadence.tasks.model

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class RecurrenceExpansionTest {
    private val zurich = ZoneId.of("Europe/Zurich")
    private val utc = ZoneId.of("UTC")

    private fun d(text: String) = LocalDate.parse(text)

    private fun timed(
        type: String,
        due: String,
        zone: ZoneId = zurich,
        rule: RecurrenceRule = RecurrenceRule(),
        minutes: Int? = null,
        status: Int = TaskStatus.NOT_STARTED,
    ): TaskItem {
        val at = LocalDateTime.parse(due).atZone(zone)
        return TaskItem(
            uid = "t", name = "Série", status = status, recurrenceType = type,
            dueDate = at.toInstant(), dueHasTime = true, dueDay = at.toLocalDate(),
            estimatedMinutes = minutes, recurrence = rule,
        )
    }

    private fun allDay(type: String, due: String, rule: RecurrenceRule = RecurrenceRule()): TaskItem {
        val day = d(due)
        return TaskItem(
            uid = "t", name = "Série", recurrenceType = type,
            dueDate = day.atTime(LocalTime.MAX).atZone(zurich).toInstant(), dueHasTime = false, dueDay = day,
            recurrence = rule,
        )
    }

    private fun days(task: TaskItem, from: String, to: String, zone: ZoneId = zurich, cap: Int = 100) =
        RecurrenceExpansion.expand(task, d(from), d(to), zone, cap).map { it.dueDay }

    @Test
    fun `a weekly 09h00 task appears on every following week with its time and estimate`() {
        val task = timed("weekly", "2026-11-02T09:00", rule = RecurrenceRule(weekday = 1), minutes = 45)

        val result = RecurrenceExpansion.expand(task, d("2026-11-01"), d("2026-11-30"), zurich)

        assertEquals(listOf(d("2026-11-09"), d("2026-11-16"), d("2026-11-23"), d("2026-11-30")), result.map { it.dueDay })
        assertTrue(result.all { LocalDateTime.ofInstant(it.dueDate, zurich).toLocalTime() == LocalTime.of(9, 0) })
        assertTrue(result.all { it.dueHasTime && it.estimatedMinutes == 45 && it.uid == "t" })
    }

    @Test
    fun `the stored occurrence itself is never repeated and the range filters the rest`() {
        val task = timed("daily", "2026-11-02T08:00")

        assertEquals(listOf(d("2026-11-04"), d("2026-11-05")), days(task, "2026-11-04", "2026-11-05"))
        assertEquals(emptyList<LocalDate>(), days(task, "2026-10-01", "2026-11-02"))
    }

    @Test
    fun `daily keeps the wall clock across the spring and autumn changes in Zurich`() {
        val spring = timed("daily", "2027-03-26T09:00")
        val autumn = timed("daily", "2026-10-24T09:00")

        val springTimes = RecurrenceExpansion.expand(spring, d("2027-03-27"), d("2027-03-29"), zurich)
        val autumnTimes = RecurrenceExpansion.expand(autumn, d("2026-10-25"), d("2026-10-27"), zurich)

        assertEquals(listOf("2027-03-27T08:00:00Z", "2027-03-28T07:00:00Z", "2027-03-29T07:00:00Z"), springTimes.map { it.dueDate.toString() })
        assertEquals(listOf("2026-10-25T08:00:00Z", "2026-10-26T08:00:00Z", "2026-10-27T08:00:00Z"), autumnTimes.map { it.dueDate.toString() })
        assertTrue((springTimes + autumnTimes).all { LocalDateTime.ofInstant(it.dueDate, zurich).toLocalTime() == LocalTime.of(9, 0) })
    }

    @Test
    fun `a time inside the spring gap moves forward and a night task keeps its day`() {
        val gap = timed("daily", "2027-03-27T02:30")
        val night = timed("weekly", "2026-10-18T00:30", rule = RecurrenceRule(weekday = 0))

        val sunday = RecurrenceExpansion.expand(gap, d("2027-03-28"), d("2027-03-28"), zurich).single()
        val nights = RecurrenceExpansion.expand(night, d("2026-10-19"), d("2026-11-02"), zurich)

        assertEquals(LocalTime.of(3, 30), LocalDateTime.ofInstant(sunday.dueDate, zurich).toLocalTime())
        assertEquals(listOf(d("2026-10-25"), d("2026-11-01")), nights.map { it.dueDay })
        assertTrue(nights.all { LocalDateTime.ofInstant(it.dueDate, zurich).toLocalTime() == LocalTime.of(0, 30) })
    }

    @Test
    fun `an untimed task stays an all-day occurrence`() {
        val task = allDay("daily", "2026-11-02", RecurrenceRule(interval = 2))

        val result = RecurrenceExpansion.expand(task, d("2026-11-01"), d("2026-11-08"), zurich)

        assertEquals(listOf(d("2026-11-04"), d("2026-11-06"), d("2026-11-08")), result.map { it.dueDay })
        assertTrue(result.none { it.dueHasTime })
    }

    @Test
    fun `weekly without a weekday adds whole weeks and honours the interval`() {
        val task = allDay("weekly", "2026-11-02", RecurrenceRule(interval = 2))

        assertEquals(listOf(d("2026-11-16"), d("2026-11-30")), days(task, "2026-11-01", "2026-11-30"))
    }

    @Test
    fun `weekly on several weekdays walks them in order`() {
        val task = allDay("weekly", "2026-11-02", RecurrenceRule(weekdays = listOf(1, 3, 5)))

        assertEquals(
            listOf(d("2026-11-04"), d("2026-11-06"), d("2026-11-09"), d("2026-11-11")),
            days(task, "2026-11-01", "2026-11-11"),
        )
    }

    @Test
    fun `a bi-weekly Monday and Wednesday pattern skips the off week after the last weekday`() {
        val task = allDay("weekly", "2026-11-02", RecurrenceRule(interval = 2, weekdays = listOf(1, 3)))

        assertEquals(
            listOf(d("2026-11-04"), d("2026-11-16"), d("2026-11-18"), d("2026-11-30")),
            days(task, "2026-11-01", "2026-11-30"),
        )
    }

    @Test
    fun `a Sunday and Monday pattern wraps from Sunday to Monday`() {
        val task = allDay("weekly", "2026-11-01", RecurrenceRule(weekdays = listOf(0, 1)))

        assertEquals(
            listOf(d("2026-11-02"), d("2026-11-08"), d("2026-11-09")),
            days(task, "2026-11-01", "2026-11-09"),
        )
    }

    @Test
    fun `a single weekday that differs from the due day moves to that weekday`() {
        val task = allDay("weekly", "2026-11-04", RecurrenceRule(weekday = 1))

        assertEquals(listOf(d("2026-11-09"), d("2026-11-16")), days(task, "2026-11-01", "2026-11-16"))
    }

    @Test
    fun `monthly clamps to the end of short months and drifts like the server`() {
        val fixed = allDay("monthly", "2026-01-31", RecurrenceRule(monthDay = 31))
        val drifting = allDay("monthly", "2026-01-31")

        assertEquals(
            listOf(d("2026-02-28"), d("2026-03-31"), d("2026-04-30")),
            days(fixed, "2026-02-01", "2026-04-30"),
        )
        assertEquals(
            listOf(d("2026-02-28"), d("2026-03-28"), d("2026-04-28")),
            days(drifting, "2026-02-01", "2026-04-30"),
        )
    }

    @Test
    fun `monthly rolls over the year and honours the interval`() {
        val task = allDay("monthly", "2026-11-15", RecurrenceRule(interval = 2, monthDay = 15))

        assertEquals(listOf(d("2027-01-15"), d("2027-03-15")), days(task, "2026-11-16", "2027-03-31"))
    }

    @Test
    fun `monthly on the nth weekday lands on that weekday and falls back when the month is short`() {
        val secondThursday = allDay("monthly_weekday", "2026-11-12", RecurrenceRule(weekday = 4, weekOfMonth = 2))
        val fifthFriday = allDay("monthly_weekday", "2026-10-30", RecurrenceRule(weekday = 5, weekOfMonth = 5))

        assertEquals(listOf(d("2026-12-10"), d("2027-01-14")), days(secondThursday, "2026-11-13", "2027-01-31"))
        assertEquals(listOf(d("2026-11-27"), d("2026-12-25")), days(fifthFriday, "2026-11-01", "2026-12-31"))
    }

    @Test
    fun `monthly on the last day follows month lengths including a leap year`() {
        val task = allDay("monthly_last_day", "2027-12-31", RecurrenceRule())
        val leap = allDay("monthly_last_day", "2028-01-31", RecurrenceRule())

        assertEquals(listOf(d("2028-01-31"), d("2028-02-29"), d("2028-03-31")), days(task, "2028-01-01", "2028-03-31"))
        assertEquals(listOf(d("2028-02-29")), days(leap, "2028-02-01", "2028-02-29"))
    }

    @Test
    fun `occurrences stop after the end date, the end day included`() {
        val task = allDay("daily", "2026-11-02", RecurrenceRule(endDay = d("2026-11-05")))

        assertEquals(listOf(d("2026-11-03"), d("2026-11-04"), d("2026-11-05")), days(task, "2026-11-01", "2026-11-30"))
    }

    @Test
    fun `skipped days are left out but the series keeps its rhythm`() {
        val task = allDay("daily", "2026-11-02", RecurrenceRule(exdates = setOf(d("2026-11-04"))))

        assertEquals(listOf(d("2026-11-03"), d("2026-11-05")), days(task, "2026-11-01", "2026-11-05"))
    }

    @Test
    fun `a completion-based series shows only its next occurrence`() {
        val task = timed("daily", "2026-11-02T09:00", rule = RecurrenceRule(completionBased = true))

        assertEquals(emptyList<LocalDate>(), days(task, "2026-11-01", "2026-11-30"))
    }

    @Test
    fun `closed, non-recurring, undated and unknown rules are not expanded`() {
        assertEquals(emptyList<LocalDate>(), days(timed("daily", "2026-11-02T09:00", status = TaskStatus.DONE), "2026-11-01", "2026-11-30"))
        assertEquals(emptyList<LocalDate>(), days(allDay("none", "2026-11-02"), "2026-11-01", "2026-11-30"))
        assertEquals(emptyList<LocalDate>(), days(allDay("yearly", "2026-11-02"), "2026-11-01", "2026-11-30"))
        assertEquals(
            emptyList<LocalDate>(),
            days(TaskItem(uid = "u", name = "x", recurrenceType = "daily"), "2026-11-01", "2026-11-30"),
        )
    }

    @Test
    fun `the number of occurrences is capped`() {
        val task = allDay("daily", "2026-01-01")

        assertEquals(100, days(task, "2026-01-02", "2028-12-31").size)
        assertEquals(3, days(task, "2026-01-02", "2028-12-31", cap = 3).size)
    }

    @Test
    fun `a series overdue for months still reaches the visible range`() {
        val task = allDay("daily", "2026-01-01")

        assertEquals(listOf(d("2026-11-02"), d("2026-11-03")), days(task, "2026-11-02", "2026-11-03"))
    }

    @Test
    fun `occurrences are computed in the device zone`() {
        val task = timed("daily", "2026-11-02T23:30", zone = utc)

        val result = RecurrenceExpansion.expand(task, d("2026-11-03"), d("2026-11-03"), utc).single()

        assertEquals(Instant.parse("2026-11-03T23:30:00Z"), result.dueDate)
    }
}
