package ch.nicolab.cadence.tasks.live

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LiveStreamTest {
    private fun parse(vararg lines: String): List<SseEvent> {
        val parser = SseParser()
        return lines.mapNotNull(parser::feed)
    }

    // Forme écrite par backend/utils/notificationStream.js.
    private val wire = arrayOf(
        "event: ready",
        "data: {}",
        "",
        ": ping",
        "",
        "id: n1",
        "event: notification",
        """data: {"uid":"n1","type":"system","title":"Hermes","message":"Ton résumé est prêt","data":{"pluginId":"hermes","openPath":"/plugins/hermes?msg=m1"},"level":"info","sources":["desktop","mobile"],"created_at":"2026-11-12T10:00:00Z"}""",
        "",
    )

    @Test
    fun readsEventsAndSkipsComments() {
        val events = parse(*wire)
        assertEquals(listOf("ready", "notification"), events.map { it.event })
        assertEquals("n1", events[1].id)
    }

    @Test
    fun joinsDataLinesAndDefaultsTheEventName() {
        val events = parse("data: a", "data:b", "", "event", "", "retry: 10", "")
        assertEquals(listOf(SseEvent("message", null, "a\nb")), events)
    }

    @Test
    fun readsANotificationForThePhone() {
        val notification = LiveNotification.of(parse(*wire)[1])!!
        assertEquals("n1", notification.uid)
        assertEquals("Hermes", notification.title)
        assertEquals("Ton résumé est prêt", notification.message)
        assertEquals("/plugins/hermes?msg=m1", notification.openPath)
        assertTrue(notification.forMobile)
    }

    @Test
    fun desktopOnlyIsNotForThePhone() {
        val event = SseEvent("notification", "n2", """{"uid":"n2","title":"x","sources":["desktop"]}""")
        assertFalse(LiveNotification.of(event)!!.forMobile)
        val none = SseEvent("notification", "n3", """{"uid":"n3","title":"x"}""")
        assertFalse(LiveNotification.of(none)!!.forMobile)
    }

    @Test
    fun ignoresOtherEventsAndBrokenBodies() {
        assertNull(LiveNotification.of(SseEvent("ready", null, "{}")))
        assertNull(LiveNotification.of(SseEvent("notification", null, "not json")))
        assertNull(LiveNotification.of(SseEvent("notification", null, """{"title":"no uid"}""")))
        assertEquals("n4", LiveNotification.of(SseEvent("notification", "n4", """{"title":"t"}"""))!!.uid)
    }

    @Test
    fun remembersEachUidOnce() {
        val first = SeenUids.add(emptyList(), "a")!!
        assertNull(SeenUids.add(first, "a"))
        assertEquals(listOf("b", "c"), SeenUids.add(listOf("a", "b"), "c", max = 2))
    }

    @Test
    fun opensAPluginPageWithItsQuery() {
        assertEquals(LiveTarget.Plugin("hermes", "?msg=m1"), LiveTarget.of("/plugins/hermes?msg=m1", null))
        assertEquals(LiveTarget.Plugin("hermes", ""), LiveTarget.of("/plugins/hermes", null))
        assertEquals(LiveTarget.Plugin("hermes", ""), LiveTarget.of("/plugins/hermes/", "t1"))
    }

    @Test
    fun refusesAnythingButAnInternalPluginPath() {
        listOf(
            "https://evil.example/plugins/hermes",
            "//evil.example/plugins/hermes",
            "/plugins/../api/users",
            "/plugins/hermes/../../x",
            "/plugins/Hermes",
            "/plugins/hermes?msg=<script>",
            "/plugins/hermes?msg=a b",
            "/plugins/hermes#frag",
            "/tasks",
            "javascript:alert(1)",
        ).forEach { assertEquals(LiveTarget.App, LiveTarget.of(it, null), it) }
    }

    @Test
    fun fallsBackToTheTaskThenTheApp() {
        assertEquals(LiveTarget.Task("abc123"), LiveTarget.of("https://x.example", "abc123"))
        assertEquals(LiveTarget.Task("abc123"), LiveTarget.of(null, "abc123"))
        assertEquals(LiveTarget.App, LiveTarget.of(null, "../x"))
        assertEquals(LiveTarget.App, LiveTarget.of(null, null))
    }

    @Test
    fun backsOffFromFiveToSixtySeconds() {
        val delays = generateSequence(Reconnect.next(null)) { Reconnect.next(it) }.take(6).toList()
        assertEquals(listOf(5_000L, 10_000L, 20_000L, 40_000L, 60_000L, 60_000L), delays)
    }
}
