package ch.nicolab.cadence.tasks.autoclassify

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class AutoClassifyPayloadTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun payload(raw: String): JsonObject = json.parseToJsonElement(raw.trimIndent()) as JsonObject

    @Test
    fun aClassifyCardKeepsOnlyTheRowsThatAreProposed() {
        val card = AutoClassifyPayload.classify(
            payload(
                """
                {"suggestion_uid":"s1","entity":"task","item_uid":"t1","title":"Acheter du lait",
                 "project":{"options":[{"uid":"p1","name":"Maison","area_name":"Vie","confidence":0.9},
                                       {"uid":"p2","name":"Courses","area_name":null,"confidence":0.5}],
                            "area":{"uid":"a1","name":"Vie"},"new_project":{"name":"Épicerie","area_uid":"a1","area_name":"Vie"}},
                 "tags":{"options":["courses"],"new_tag":"lait"},
                 "priority":{"value":2,"confidence":0.85}}
                """,
            ),
        )!!

        assertEquals("s1", card.suggestionUid)
        assertEquals("task", card.entity)
        assertEquals("t1", card.itemUid)
        val project = card.project!!
        assertEquals(listOf("Maison", "Courses"), project.options.map { it.name })
        assertEquals("Vie", project.options.first().areaName)
        assertEquals("a1", project.area!!.uid)
        assertEquals("Épicerie", project.newProject!!.name)
        val tags = card.tags!!
        assertEquals(listOf("courses"), tags.options)
        assertEquals("lait", tags.newTag)
        assertEquals(2, card.priority)
    }

    @Test
    fun aRowThatIsNullIsAbsentFromTheCard() {
        val card = AutoClassifyPayload.classify(
            payload("""{"suggestion_uid":"s2","entity":"note","item_uid":"n1","title":"Idée","project":null,"tags":null,"priority":null}"""),
        )!!

        assertNull(card.project)
        assertNull(card.tags)
        assertNull(card.priority)
    }

    @Test
    fun anUnknownPriorityValueIsIgnored() {
        val card = AutoClassifyPayload.classify(
            payload("""{"suggestion_uid":"s3","entity":"link","item_uid":"l1","title":"x","priority":{"value":5,"confidence":0.9}}"""),
        )!!

        assertNull(card.priority)
    }

    @Test
    fun aClassifyPayloadWithoutItsIdentityIsRefusedNotCrashed() {
        assertNull(AutoClassifyPayload.classify(payload("""{"entity":"task","title":"sans identifiant"}""")))
        assertNull(AutoClassifyPayload.classify(null))
    }

    @Test
    fun aDuplicateCardReadsBothLinks() {
        val card = AutoClassifyPayload.duplicate(
            payload(
                """
                {"suggestion_uid":"d1","entity":"link","item_uid":"l2","title":"Nouveau","url":"https://a.example/x",
                 "reason":"address","original":{"uid":"l1","title":"Ancien","url":"https://a.example/x?utm=1"}}
                """,
            ),
        )!!

        assertEquals("address", card.reason)
        assertEquals("https://a.example/x", card.url)
        assertEquals("l1", card.original.uid)
        assertEquals("Ancien", card.original.title)
    }

    @Test
    fun aDuplicateWithoutOriginalIsRefused() {
        assertNull(AutoClassifyPayload.duplicate(payload("""{"suggestion_uid":"d2","item_uid":"l3","url":"u","reason":"title"}""")))
    }

    @Test
    fun aSuggestionListEntryIsParsedAndAnEmptyOneIsSkipped() {
        val entry = json.parseToJsonElement(
            """{"uid":"s9","kind":"classify","entity":"task","item_uid":"t9","payload":{"title":"Payer"},"created_at":"x","expires_at":"y"}""",
        )
        val parsed = PendingSuggestion.parse(entry)!!

        assertEquals("Payer", parsed.headline)
        assertEquals(false, parsed.isDuplicate)
        assertNull(PendingSuggestion.parse(json.parseToJsonElement("""{"kind":"classify"}""")))
    }
}
