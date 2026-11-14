package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.calendar.CalendarEvent
import ch.nicolab.cadence.calendar.DeviceCalendar
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Planifier v2 : bande de la semaine, tiroir, choix d'une tâche et ordre des lignes d'un jour. */
class PlanWeekTest {
    private val zone = ZoneId.of("Europe/Zurich")
    // Samedi 14 novembre 2026.
    private val today = LocalDate.of(2026, 11, 14)
    private val tomorrow = today.plusDays(1)
    private val calendar = DeviceCalendar(
        id = 1,
        accountName = "compte",
        accountType = "com.google",
        displayName = "Perso",
        colorArgb = 0x1E88E5,
        visibleOnDevice = true,
    )

    private fun task(uid: String, estimated: Int? = null, recurrence: String? = null, fileBacked: Boolean = false) =
        TaskItem(uid = uid, name = uid, estimatedMinutes = estimated, recurrenceType = recurrence, fileBacked = fileBacked)

    private fun card(task: TaskItem, day: LocalDate = today, line: PlanEntry? = null) = PlanCard(task, day, line)

    private fun at(date: LocalDate, hour: Int, minute: Int = 0): Long =
        ZonedDateTime.of(date, java.time.LocalTime.of(hour, minute), zone).toInstant().toEpochMilli()

    private fun timed(title: String, begin: Long, minutes: Long = 60, color: Int = 0xE53935) = EventWithDone(
        event = CalendarEvent(
            calendarId = 1,
            eventId = title.hashCode().toLong(),
            instanceBegin = begin,
            instanceEnd = begin + minutes * 60_000,
            allDay = false,
            title = title,
            location = null,
            colorArgb = color,
        ),
        calendar = calendar,
        done = false,
    )

    private fun allDay(title: String, date: LocalDate, color: Int = 0x43A047) = EventWithDone(
        event = CalendarEvent(
            calendarId = 1,
            eventId = title.hashCode().toLong(),
            instanceBegin = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
            instanceEnd = date.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
            allDay = true,
            title = title,
            location = null,
            colorArgb = color,
        ),
        calendar = calendar,
        done = false,
    )

    private fun week(vararg free: LocalDate) = (0 until 7).map { offset ->
        val date = today.plusDays(offset.toLong())
        WeekDay(
            date = date,
            taskCount = if (date in free) 0 else 1,
            minutes = 0,
            capacityMinutes = 0,
            eventCount = 0,
            eventColors = emptyList(),
        )
    }

    private fun horizons(vararg filled: Pair<Horizon, List<TaskItem>>) = PlanHorizons(
        buckets = Horizon.entries.associateWith { horizon -> filled.filter { it.first == horizon }.flatMap { it.second } },
        plannedThisWeek = emptyList(),
    )

    @Test
    fun `start avance et recule par pages de sept jours`() {
        assertEquals(today, PlanWeek.start(today, 0))
        assertEquals(today.plusDays(7), PlanWeek.start(today, 1))
        assertEquals(today.minusDays(7), PlanWeek.start(today, -1))
    }

    @Test
    fun `days compte les tâches et les minutes, les jours absents valent zéro`() {
        val days = listOf(
            PlanDay(
                today,
                open = listOf(card(task("a", estimated = 45)), card(task("b"))),
                done = listOf(card(task("x", estimated = 90))),
            ),
            PlanDay(today.plusDays(2), open = listOf(card(task("c", estimated = 60), day = today.plusDays(2))), done = emptyList()),
        )
        val result = PlanWeek.days(today, days, emptyList(), zone) { if (it == today) 120 else 0 }

        assertEquals(7, result.size)
        assertEquals(today, result[0].date)
        assertEquals(2, result[0].taskCount)
        assertEquals(45, result[0].minutes)
        assertEquals(120, result[0].capacityMinutes)
        assertEquals(0, result[1].taskCount)
        assertEquals(0, result[1].minutes)
        assertEquals(1, result[2].taskCount)
        assertEquals(60, result[2].minutes)
    }

    @Test
    fun `days compte les événements qui touchent le jour et garde trois couleurs au plus`() {
        val day = today.plusDays(3)
        val events = listOf(
            timed("Un", at(day, 9), color = 1),
            timed("Deux", at(day, 10), color = 2),
            timed("Trois", at(day, 11), color = 3),
            timed("Quatre", at(day, 12), color = 4),
        )
        val result = PlanWeek.days(today, emptyList(), events, zone) { 0 }[3]

        assertEquals(4, result.eventCount)
        assertEquals(listOf(1, 2, 3), result.eventColors)
    }

    @Test
    fun `une journée entière compte sur son jour et une couleur d'événement vide prend celle de l'agenda`() {
        val day = today.plusDays(4)
        val events = listOf(allDay("Congé", day), timed("Sans couleur", at(day, 9), color = 0))
        val result = PlanWeek.days(today, emptyList(), events, zone) { 0 }

        assertEquals(2, result[4].eventCount)
        assertEquals(listOf(0x43A047, calendar.colorArgb), result[4].eventColors)
        assertEquals(0, result[5].eventCount)
    }

    @Test
    fun `plein quand la charge atteint la capacité, jamais sans capacité`() {
        val full = WeekDay(today, taskCount = 3, minutes = 120, capacityMinutes = 120, eventCount = 0, eventColors = emptyList())
        val under = full.copy(minutes = 119)
        val noCapacity = full.copy(capacityMinutes = 0, minutes = 500)

        assertTrue(full.full)
        assertFalse(under.full)
        assertFalse(noCapacity.full)
    }

    @Test
    fun `libre quand ni tâche ni événement`() {
        val empty = WeekDay(today, taskCount = 0, minutes = 0, capacityMinutes = 0, eventCount = 0, eventColors = emptyList())

        assertTrue(empty.free)
        assertFalse(empty.copy(eventCount = 1).free)
        assertFalse(empty.copy(taskCount = 1).free)
    }

    @Test
    fun `tiroir sans doublon, dans l'ordre des filtres, et sans filtre vide`() {
        val tray = PlanWeek.tray(
            unsorted = listOf(task("u1"), task("u2")),
            horizons = horizons(
                Horizon.WEEK to listOf(task("u1"), task("w1")),
                Horizon.NEXT_WEEK to listOf(task("n1"), task("w1")),
                Horizon.THIS_MONTH to listOf(task("m1")),
                Horizon.SOMEDAY to listOf(task("s9")),
            ),
            toSchedule = ToSchedule(
                stale = listOf(task("u2"), task("s1")),
                week = listOf(task("w1"), task("w2")),
                month = listOf(task("m1"), task("m2")),
            ),
        )

        assertEquals(listOf("u1", "u2", "s1"), tray.tasks.getValue(TrayFilter.TO_PLACE).map { it.uid })
        assertEquals(listOf("w1", "w2"), tray.tasks.getValue(TrayFilter.WEEK).map { it.uid })
        assertEquals(listOf("m1", "m2"), tray.tasks.getValue(TrayFilter.MONTH).map { it.uid })
        assertEquals(listOf("n1", "s9"), tray.tasks.getValue(TrayFilter.LATER).map { it.uid })
        assertEquals(listOf(TrayFilter.TO_PLACE, TrayFilter.WEEK, TrayFilter.MONTH, TrayFilter.LATER), tray.filters)
        assertEquals(9, tray.total)
    }

    @Test
    fun `tiroir sans tâche d'un filtre omet ce filtre`() {
        val tray = PlanWeek.tray(
            unsorted = listOf(task("u1")),
            horizons = horizons(),
            toSchedule = ToSchedule(),
        )

        assertEquals(listOf(TrayFilter.TO_PLACE), tray.filters)
        assertEquals(1, tray.total)
    }

    @Test
    fun `choix d'une tâche simple, Quand puis horizons puis date, Autre avec abandon`() {
        val choices = PlanWeek.choices(task("a"), today, week())

        assertEquals(
            listOf(
                PlanChoice.Day(today),
                PlanChoice.Day(tomorrow),
                PlanChoice.ToHorizon(Horizon.WEEK),
                PlanChoice.ToHorizon(Horizon.NEXT_WEEK),
                PlanChoice.ToHorizon(Horizon.THIS_MONTH),
                PlanChoice.ToHorizon(Horizon.NEXT_MONTH),
                PlanChoice.ToHorizon(Horizon.SOMEDAY),
                PlanChoice.PickDate,
            ),
            choices.whenChoices,
        )
        assertEquals(listOf(PlanChoice.Done, PlanChoice.Open, PlanChoice.Drop), choices.other)
    }

    @Test
    fun `une série n'a pas d'horizons`() {
        val choices = PlanWeek.choices(task("r", recurrence = "weekly"), today, week())

        assertEquals(listOf(PlanChoice.Day(today), PlanChoice.Day(tomorrow), PlanChoice.PickDate), choices.whenChoices)
    }

    @Test
    fun `une tâche de fichier n'a pas d'abandon`() {
        val choices = PlanWeek.choices(task("f", fileBacked = true), today, week())

        assertEquals(listOf(PlanChoice.Done, PlanChoice.Open), choices.other)
    }

    @Test
    fun `les jours libres après demain sont proposés au plus deux fois`() {
        val free = listOf(today, tomorrow, today.plusDays(2), today.plusDays(3), today.plusDays(4))
        val choices = PlanWeek.choices(task("a"), today, week(*free.toTypedArray()))

        assertEquals(PlanChoice.Day(today.plusDays(2), free = true), choices.whenChoices[2])
        assertEquals(PlanChoice.Day(today.plusDays(3), free = true), choices.whenChoices[3])
        assertEquals(PlanChoice.ToHorizon(Horizon.WEEK), choices.whenChoices[4])
        assertEquals(2, choices.whenChoices.count { it is PlanChoice.Day && it.free })
    }

    @Test
    fun `dayItems met la journée entière, puis événements et cartes à heure, puis cartes sans heure`() {
        val timedCard = card(task("a"), line = PlanEntry("a", today, 600, 30))
        val untimedPlanned = card(task("b"), line = PlanEntry("b", today, null, null))
        val dueAt14 = task("c").copy(dueDate = at(today, 14, 30).let(Instant::ofEpochMilli), dueHasTime = true)
        val dueAnytime = task("d")
        val day = PlanDay(today, open = listOf(timedCard, untimedPlanned, card(dueAt14), card(dueAnytime)), done = emptyList())
        val events = listOf(
            allDay("Anniversaire", today),
            timed("Réunion", at(today, 9, 30)),
            timed("Demain", at(tomorrow, 9)),
        )

        val labels = PlanWeek.dayItems(day, events, zone).map {
            when (it) {
                is PlanDayItem.Card -> "carte:${it.card.task.uid}:${it.startMinute}"
                is PlanDayItem.Event -> "agenda:${it.event.event.title}"
            }
        }

        assertEquals(
            listOf(
                "agenda:Anniversaire",
                "agenda:Réunion",
                "carte:a:600",
                "carte:c:870",
                "carte:b:null",
                "carte:d:null",
            ),
            labels,
        )
    }

    @Test
    fun `capacity is the working span on a workday and zero otherwise`() {
        val hours = WorkingHours(java.time.LocalTime.of(9, 0), java.time.LocalTime.of(17, 0))
        // Lundi 16 novembre : jour ouvré ; samedi 14 : non.
        assertEquals(8 * 60, PlanWeek.capacity(hours, LocalDate.of(2026, 11, 16)))
        assertEquals(0, PlanWeek.capacity(hours, today))
    }

    @Test
    fun `load fills against capacity, or eight hours without capacity, capped at one`() {
        fun day(minutes: Int, capacity: Int) = WeekDay(today, 1, minutes, capacity, 0, emptyList())
        assertEquals(0.5f, day(240, 480).load)
        assertEquals(1f, day(600, 480).load)
        assertEquals(0.25f, day(120, 0).load)
        assertEquals(0f, day(0, 0).load)
    }
}
