package ch.nicolab.cadence.tasks.plugins

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PluginsTest {
    private fun obj(text: String) = Json.parseToJsonElement(text).jsonObject

    // Forme de `view()` dans backend/modules/plugins/service.js.
    private val listBody = obj(
        """
        {"configured": true, "plugins": [
          {"id": "hermes", "folder": "hermes", "name": "Hermes", "description": "Forwards events.",
           "version": "1.1.0", "loaded_version": "1.0.0", "previous_version": "0.9.0", "state": "active",
           "last_error": null, "permissions": ["events", "routes"], "events": ["task.created"],
           "settings": [
             {"key": "url", "type": "string", "label": "Webhook address", "required": true, "value": "https://h.example"},
             {"key": "secret", "type": "secret", "label": "Signing secret", "has_value": true},
             {"key": "notes", "type": "boolean", "label": "Send notes", "value": true},
             {"key": "limit", "type": "number", "label": "Limit", "value": 3},
             {"key": "mode", "type": "select", "label": "Mode", "options": ["a", "b"], "value": "b", "help": "Pick one"}
           ],
           "update": {"url": "https://u.example", "latest": "1.2.0", "available": true, "checked_at": "2026-11-12T10:00:00Z", "error": null},
           "entry_missing": false, "menu": {"label": "Hermes", "page": "ui/index.html"}, "installed_from_git": true},
          {"id": null, "folder": "broken", "name": "broken", "description": "", "version": null, "state": "invalid",
           "last_error": "manifest.json is missing", "permissions": [], "events": [], "settings": [], "update": null,
           "installed_from_git": false}
        ]}
        """,
    )

    @Test
    fun readsTheListWithEveryField() {
        val list = PluginJson.list(listBody)
        assertTrue(list.configured)
        assertEquals(2, list.plugins.size)
        val hermes = list.plugins[0]
        assertEquals("hermes", hermes.id)
        assertEquals("Hermes", hermes.name)
        assertEquals("1.1.0", hermes.version)
        assertEquals("1.0.0", hermes.loadedVersion)
        assertEquals("0.9.0", hermes.previousVersion)
        assertEquals(Plugin.ACTIVE, hermes.state)
        assertNull(hermes.lastError)
        assertEquals(listOf("events", "routes"), hermes.permissions)
        assertEquals(listOf("task.created"), hermes.events)
        assertEquals(listOf("url", "secret", "notes", "limit", "mode"), hermes.settings.map { it.key })
        assertTrue(hermes.settings[0].required)
        assertTrue(hermes.settings[1].hasValue)
        assertNull(hermes.settings[1].value)
        assertEquals(listOf("a", "b"), hermes.settings[4].options)
        assertEquals("Pick one", hermes.settings[4].help)
        assertEquals("1.2.0", hermes.update?.latest)
        assertTrue(hermes.update?.available == true)
        assertTrue(hermes.installedFromGit)
        assertTrue(hermes.enabled)
        assertTrue(hermes.canSwitch)
        assertTrue(hermes.showsSettings)
        assertTrue(hermes.reloadPending)
    }

    @Test
    fun aBrokenFolderHasNoIdNoSwitchAndNoSettings() {
        val broken = PluginJson.list(listBody).plugins[1]
        assertNull(broken.id)
        assertEquals(Plugin.INVALID, broken.state)
        assertEquals("manifest.json is missing", broken.lastError)
        assertFalse(broken.canSwitch)
        assertFalse(broken.showsSettings)
        assertNull(broken.update)
    }

    @Test
    fun notConfiguredMeansNoPlugins() {
        val list = PluginJson.list(obj("""{"configured": false, "plugins": []}"""))
        assertFalse(list.configured)
        assertTrue(list.plugins.isEmpty())
    }

    @Test
    fun readsTheMenuAndRoundTripsTheStoredCopy() {
        val items = PluginJson.menu(
            obj("""{"items": [{"id": "hello", "label": "Hello", "path": "/plugins/hello", "file": "index.html"}, {"label": "no id"}]}"""),
        )
        assertEquals(listOf(PluginMenuItem("hello", "Hello", "/plugins/hello", "index.html")), items)
        assertEquals(items, PluginJson.menu(PluginJson.menuBody(items)))
        assertTrue(PluginJson.menu(obj("{}")).isEmpty())
    }

    @Test
    fun readsTheServerErrorAsIs() {
        assertEquals("Could not update: not a git repository", PluginJson.error(obj("""{"error": "Could not update: not a git repository"}""")))
        assertNull(PluginJson.error(null))
    }

    private val fields get() = PluginJson.list(listBody).plugins[0].settings

    @Test
    fun theFormStartsFromTheServerValuesWithSecretsEmpty() {
        val form = PluginSettingsForm.of(fields)
        assertEquals("https://h.example", form.text["url"])
        assertEquals("3", form.text["limit"])
        assertEquals("b", form.text["mode"])
        assertEquals(true, form.flags["notes"])
        assertNull(form.text["secret"])
    }

    @Test
    fun anUntouchedSecretIsLeftOutOfTheBody() {
        val body = PluginSettingsForm.body(fields, PluginSettingsForm.of(fields)).getOrThrow()
        assertFalse("secret" in body)
        assertEquals(JsonPrimitive("https://h.example"), body["url"])
        assertEquals(JsonPrimitive(true), body["notes"])
        assertEquals(JsonPrimitive(3L), body["limit"])
        assertEquals(JsonPrimitive("b"), body["mode"])
    }

    @Test
    fun aTypedSecretIsSentAndAClearedOneIsNull() {
        val typed = PluginSettingsForm.of(fields).withText("secret", "s3cr3t")
        assertEquals(JsonPrimitive("s3cr3t"), PluginSettingsForm.body(fields, typed).getOrThrow()["secret"])

        val cleared = typed.clearSecret("secret")
        assertEquals(JsonNull, PluginSettingsForm.body(fields, cleared).getOrThrow()["secret"])

        val typedAgain = cleared.withText("secret", "new")
        assertEquals(JsonPrimitive("new"), PluginSettingsForm.body(fields, typedAgain).getOrThrow()["secret"])
    }

    @Test
    fun numbersAreParsedAndAnEmptyOneReturnsToTheDefault() {
        val base = PluginSettingsForm.of(fields)
        assertEquals(JsonPrimitive(2.5), PluginSettingsForm.body(fields, base.withText("limit", "2,5")).getOrThrow()["limit"])
        assertEquals(JsonNull, PluginSettingsForm.body(fields, base.withText("limit", " ")).getOrThrow()["limit"])
        val failure = PluginSettingsForm.body(fields, base.withText("limit", "deux")).exceptionOrNull()
        assertEquals("limit", failure?.message)
    }

    @Test
    fun thePageUrlEncodesIdAndFile() {
        val item = PluginMenuItem("hello", "Hello", "/plugins/hello", "index page.html")
        assertEquals("https://cadence.example/api/plugins/hello/ui/index%20page.html", PluginUrls.page("https://cadence.example/", item))
        assertEquals("http://10.0.0.2:3002/api/plugins/hello/ui/index%20page.html", PluginUrls.page("http://10.0.0.2:3002", item))
    }

    @Test
    fun onlyTheServerOriginGetsTheToken() {
        val base = "https://cadence.example"
        assertTrue(PluginUrls.sameOrigin(base, "https://cadence.example/api/plugins/hello/x/data"))
        assertTrue(PluginUrls.sameOrigin(base, "https://CADENCE.example:443/api/plugins/hello/ui/app.js"))
        assertFalse(PluginUrls.sameOrigin(base, "http://cadence.example/api/plugins/hello/ui/app.js"))
        assertFalse(PluginUrls.sameOrigin(base, "https://cadence.example:8443/x"))
        assertFalse(PluginUrls.sameOrigin(base, "https://cadence.example.evil.test/x"))
        assertFalse(PluginUrls.sameOrigin(base, "https://cdn.example/lib.js"))
        assertFalse(PluginUrls.sameOrigin(base, "not a url"))
    }
}
