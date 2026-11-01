package ch.nicolab.cadence.tasks.model

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

/** Rejoue fixtures/tags/colors.json ; le jumeau JavaScript est frontend/utils/__tests__/tagColor.test.ts. */
class TagColorsTest {
    private val fixture: JsonObject = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "fixtures/tags/colors.json") }
        .first { it.isFile }
        .let { Json.parseToJsonElement(it.readText()).jsonObject }

    private fun JsonElement.str(key: String): String = jsonObject.getValue(key).jsonPrimitive.content

    private fun tag(element: JsonElement): TagItem {
        val color = element.jsonObject.getValue("color")
        return TagItem(uid = element.str("name"), name = element.str("name"), color = if (color is JsonNull) null else color.jsonPrimitive.content)
    }

    @Test
    fun `the palette is the one shared with the web`() {
        val shared = fixture.getValue("palette").jsonArray.map { listOf(it.str("key"), it.str("value"), it.str("dark"), it.str("medium")) }
        assertEquals(shared, TagColors.PALETTE.map { listOf(it.key, it.deep, it.light, it.medium) })
    }

    @TestFactory
    fun `derived colors match the shared vectors`(): List<DynamicTest> =
        fixture.getValue("derived").jsonArray.map {
            DynamicTest.dynamicTest(it.str("name")) { assertEquals(it.str("color"), TagColors.derived(it.str("name")).light) }
        }

    @TestFactory
    fun `resolution matches the shared cases`(): List<DynamicTest> =
        fixture.getValue("resolve").jsonArray.map { case ->
            DynamicTest.dynamicTest(case.str("title")) {
                val tags = case.jsonObject.getValue("tags").jsonArray.map(::tag)
                val target = tag(case.jsonObject.getValue("tag"))
                assertEquals(case.str("color"), TagColors.resolve(target, tags).light)
            }
        }

    @Test
    fun `explicit beats parent beats derived`() {
        val parent = TagItem("p", "perso", color = "#dc2626")
        val own = TagItem("c", "perso/sport", color = "#16a34a")
        val bare = TagItem("b", "perso/sport/course")
        val tags = listOf(parent, own, bare)
        assertEquals("#16a34a", TagColors.resolve(own, tags).light)
        assertEquals("#16a34a", TagColors.resolve(bare, tags).light)
        assertEquals("#dc2626", TagColors.resolve(TagItem("d", "perso/lecture"), tags).light)
        assertEquals(TagColors.derived("zzz"), TagColors.resolve(TagItem("z", "zzz"), tags))
    }

    @Test
    fun `a palette color keeps its lighter dark-mode twin and a free color serves both modes`() {
        assertEquals(TagColor("#1d4ed8", "#60a5fa"), TagColors.parse("#1D4ED8"))
        assertEquals(TagColor("#2563eb", "#60a5fa"), TagColors.parse("#2563eb"))
        assertEquals(TagColor("#123456", "#123456"), TagColors.parse("#123456"))
        assertEquals(null, TagColors.parse("blue"))
        assertEquals(null, TagColors.parse(""))
    }

    @Test
    fun `argb is opaque`() {
        assertEquals(0xFF1D4ED8.toInt(), TagColors.argb("#1d4ed8"))
        assertTrue(TagColors.shades(TagColors.PALETTE.first()).size == 3)
        assertNotEquals(TagColors.derived("a"), TagColors.derived("b"))
    }
}
