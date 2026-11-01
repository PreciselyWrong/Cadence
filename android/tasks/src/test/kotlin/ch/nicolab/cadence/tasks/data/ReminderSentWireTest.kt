package ch.nicolab.cadence.tasks.data

import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ReminderSentWireTest {
    private fun item(json: String) =
        TaskRow(WireCodec.taskFromWire(Json.parseToJsonElement(json).jsonObject), pendingSync = false)
            .toItem(java.time.ZoneOffset.UTC, java.time.ZoneOffset.UTC)

    @Test
    fun `reads the server stamp of an already notified reminder`() {
        val task = item(
            """{"uid":"t1","name":"Appeler","reminder_at":"2026-11-02T08:00:00.000Z","reminder_sent_at":"2026-11-02T08:00:05.000Z"}""",
        )

        assertEquals(Instant.parse("2026-11-02T08:00:05Z"), task.reminderSentAt)
        assertTrue(task.reminderAlreadySent)
    }

    @Test
    fun `a reminder moved after the stamp is not notified yet`() {
        val task = item(
            """{"uid":"t1","name":"Appeler","reminder_at":"2026-11-03T08:00:00.000Z","reminder_sent_at":"2026-11-02T08:00:05.000Z"}""",
        )

        assertFalse(task.reminderAlreadySent)
    }

    @Test
    fun `a task without a stamp or without a reminder is never already sent`() {
        val fresh = item("""{"uid":"t1","name":"Appeler","reminder_at":"2026-11-02T08:00:00.000Z","reminder_sent_at":null}""")
        val noReminder = item("""{"uid":"t2","name":"Lire","reminder_sent_at":"2026-11-02T08:00:05.000Z"}""")

        assertNull(fresh.reminderSentAt)
        assertFalse(fresh.reminderAlreadySent)
        assertFalse(noReminder.reminderAlreadySent)
    }
}
