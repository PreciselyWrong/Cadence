package ch.nicolab.cadence.tasks.plugins

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PluginBridgeTest {
    private val base = "https://cadence.example:8443"
    private val page = "$base/api/plugins/hermes/ui/index.html"

    private fun bridge(url: String?, opened: MutableList<PluginTarget> = mutableListOf()) =
        PluginBridge(base, "tt_secret", { url }, { opened += it })

    @Test
    fun `token is given to a page of the server`() {
        assertEquals("tt_secret", bridge(page).token())
    }

    @Test
    fun `token is refused outside the server origin`() {
        assertEquals("", bridge("https://evil.example/api/plugins/hermes/ui/index.html").token())
        assertEquals("", bridge("http://cadence.example:8443/x").token())
        assertEquals("", bridge("https://cadence.example/x").token())
        assertEquals("", bridge("about:blank").token())
        assertEquals("", bridge(null).token())
    }

    @Test
    fun `open forwards valid targets`() {
        val opened = mutableListOf<PluginTarget>()
        val bridge = bridge(page, opened)
        bridge.open("task", "abc123")
        bridge.open("note", " n_1-x ")
        bridge.open("project", "p9")
        bridge.open("url", "https://example.com/a?b=1")
        assertEquals(
            listOf(
                PluginTarget.Task("abc123"),
                PluginTarget.Note("n_1-x"),
                PluginTarget.Project("p9"),
                PluginTarget.Url("https://example.com/a?b=1"),
            ),
            opened,
        )
    }

    @Test
    fun `open ignores everything from a page outside the server`() {
        val opened = mutableListOf<PluginTarget>()
        bridge("https://evil.example/", opened).open("task", "abc123")
        assertTrue(opened.isEmpty())
    }

    @Test
    fun `unknown targets and bad references are ignored`() {
        assertNull(PluginTarget.parse("person", "abc"))
        assertNull(PluginTarget.parse("TASK", "abc"))
        assertNull(PluginTarget.parse(null, "abc"))
        assertNull(PluginTarget.parse("task", null))
        assertNull(PluginTarget.parse("task", "  "))
        assertNull(PluginTarget.parse("task", "../settings"))
        assertNull(PluginTarget.parse("note", "a/b"))
        assertNull(PluginTarget.parse("project", "x".repeat(129)))
    }

    @Test
    fun `url target accepts only http and https addresses`() {
        assertEquals(PluginTarget.Url("http://example.com"), PluginTarget.parse("url", "http://example.com"))
        assertEquals(PluginTarget.Url("HTTPS://example.com/x"), PluginTarget.parse("url", "HTTPS://example.com/x"))
        assertNull(PluginTarget.parse("url", "javascript:alert(1)"))
        assertNull(PluginTarget.parse("url", "intent://scan#Intent;scheme=zxing;end"))
        assertNull(PluginTarget.parse("url", "file:///sdcard/x"))
        assertNull(PluginTarget.parse("url", "content://ch.nicolab/x"))
        assertNull(PluginTarget.parse("url", "tududi-task://open/abc"))
        assertNull(PluginTarget.parse("url", "https:///nohost"))
        assertNull(PluginTarget.parse("url", "/api/tasks"))
        assertNull(PluginTarget.parse("url", "not a url"))
        assertNull(PluginTarget.parse("url", "https://example.com/" + "a".repeat(4096)))
    }
}
