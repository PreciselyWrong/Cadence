package ch.nicolab.cadence.domain

import java.time.Instant
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class HealthConnectImportPlannerTest {
    private val running = 56
    private val cycling = 8
    private val start = Instant.parse("2026-09-21T06:30:00Z")

    @Test
    fun `matches any selected type and optional source`() {
        val rules = listOf(
            HealthConnectRule("run", setOf(running, cycling), null),
            HealthConnectRule("strava", setOf(running), "com.strava"),
            HealthConnectRule("other", setOf(cycling), "com.strava"),
        )
        val session = session(type = running, source = "com.strava")

        val planned = HealthConnectImportPlanner.plan(rules, listOf(session), emptySet())

        assertEquals(setOf("run", "strava"), planned.map { it.habitId }.toSet())
        assertTrue(planned.all { it.valueSeconds == 2_700L })
    }

    @Test
    fun `rejects wrong source type disabled rule and invalid duration`() {
        val rules = listOf(
            HealthConnectRule("wrong-source", setOf(running), "com.garmin"),
            HealthConnectRule("wrong-type", setOf(cycling), null),
            HealthConnectRule("disabled", setOf(running), null, enabled = false),
        )
        val invalid = session(recordId = "bad", end = start)

        assertTrue(HealthConnectImportPlanner.plan(rules, listOf(session(), invalid), emptySet()).isEmpty())
    }

    @Test
    fun `known imported ignored and detached sessions stay idempotent`() {
        val rule = HealthConnectRule("run", setOf(running), null)
        HealthConnectImportState.entries.forEach { state ->
            val known = setOf(HealthConnectImportKey("record", "run", state))
            assertTrue(HealthConnectImportPlanner.plan(listOf(rule), listOf(session()), known).isEmpty())
        }
    }

    @Test
    fun `one session may feed distinct habits with stable distinct entry ids`() {
        val rules = listOf(
            HealthConnectRule("cardio", setOf(running), null),
            HealthConnectRule("training", setOf(running), null),
        )

        val first = HealthConnectImportPlanner.plan(rules, listOf(session()), emptySet())
        val second = HealthConnectImportPlanner.plan(rules, listOf(session()), emptySet())

        assertEquals(first.map { it.entryId }, second.map { it.entryId })
        assertNotEquals(first[0].entryId, first[1].entryId)
    }

    @Test
    fun `preserves observed zone and start date`() {
        val planned = HealthConnectImportPlanner.plan(
            listOf(HealthConnectRule("run", setOf(running), null)),
            listOf(session(zone = ZoneId.of("Europe/Zurich"))),
            emptySet(),
        ).single()

        assertEquals(ZoneId.of("Europe/Zurich"), planned.observedZoneId)
        assertEquals(start, planned.occurredAt)
        assertEquals(start.atZone(ZoneId.of("Europe/Zurich")).toLocalDate(), planned.localDate)
    }

    @Test
    fun `health connect entry source round trips without exposing other sources`() {
        val source = HabitEntrySource.healthConnect("com.strava")

        assertEquals("com.strava", HabitEntrySource.healthConnectPackage(source))
        assertTrue(HabitEntrySource.isHealthConnect(source))
        assertEquals(null, HabitEntrySource.healthConnectPackage("APP"))
    }

    private fun session(
        recordId: String = "record",
        type: Int = running,
        source: String = "com.strava",
        end: Instant = start.plusSeconds(2_700),
        zone: ZoneId = ZoneId.of("UTC"),
    ) = HealthConnectSession(recordId, type, source, start, end, zone)
}
