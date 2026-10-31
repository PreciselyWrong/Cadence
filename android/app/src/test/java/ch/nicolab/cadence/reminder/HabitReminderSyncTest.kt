package ch.nicolab.cadence.reminder

import ch.nicolab.cadence.data.local.entities.HabitReminderEntity
import ch.nicolab.cadence.domain.QuietHours
import ch.nicolab.cadence.domain.QuietPolicy
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class HabitReminderSyncTest {
    private val zurich = ZoneId.of("Europe/Zurich")
    private val now = ZonedDateTime.of(2026, 11, 2, 12, 0, 0, 0, zurich)

    private class FakeSink : HabitAlarmSink {
        val armed = mutableMapOf<String, Long>()
        val cancelled = mutableListOf<String>()
        override fun set(reminderId: String, triggerAtEpochMilli: Long) {
            armed[reminderId] = triggerAtEpochMilli
        }
        override fun cancel(reminderId: String) {
            cancelled += reminderId
        }
    }

    private fun reminder(id: String, time: String, enabled: Boolean = true) =
        HabitReminderEntity(id, "habit-$id", time, "", enabled, true)

    private fun millis(local: String) = ZonedDateTime.parse("$local[Europe/Zurich]").toInstant().toEpochMilli()

    @Test
    fun `pose une alarme par rappel actif à sa prochaine heure`() {
        val sink = FakeSink()

        val armed = HabitReminderSync.apply(sink, listOf(reminder("a", "18:30"), reminder("b", "08:00")), emptySet(), now, QuietPolicy.NONE)

        assertEquals(mapOf("a" to millis("2026-11-02T18:30+01:00"), "b" to millis("2026-11-03T08:00+01:00")), sink.armed)
        assertEquals(setOf("a", "b"), armed)
    }

    @Test
    fun `retire l'alarme d'un rappel désactivé ou disparu après une synchro`() {
        val sink = FakeSink()

        val armed = HabitReminderSync.apply(
            sink,
            listOf(reminder("a", "18:30"), reminder("off", "09:00", enabled = false)),
            previouslyArmed = setOf("a", "off", "supprime"),
            now,
            QuietPolicy.NONE,
        )

        assertEquals(setOf("a"), armed)
        assertEquals(setOf("off", "supprime"), sink.cancelled.toSet())
        assertEquals(setOf("a"), sink.armed.keys)
    }

    @Test
    fun `repousse à la fin de la plage silencieuse un rappel qui y tombe`() {
        val sink = FakeSink()
        val quiet = QuietPolicy(QuietHours(true, LocalTime.of(22, 0), LocalTime.of(7, 0)), zurich)

        HabitReminderSync.apply(sink, listOf(reminder("night", "23:15"), reminder("day", "18:00")), emptySet(), now, quiet)

        assertEquals(millis("2026-11-03T07:00+01:00"), sink.armed.getValue("night"))
        assertEquals(millis("2026-11-02T18:00+01:00"), sink.armed.getValue("day"))
    }

    @Test
    fun `rejouer la même liste repose les mêmes heures`() {
        val sink = FakeSink()
        val list = listOf(reminder("a", "18:30"))

        val first = HabitReminderSync.apply(sink, list, emptySet(), now, QuietPolicy.NONE)
        val snapshot = sink.armed.toMap()
        HabitReminderSync.apply(sink, list, first, now, QuietPolicy.NONE)

        assertEquals(snapshot, sink.armed)
        assertEquals(emptyList<String>(), sink.cancelled)
    }
}
