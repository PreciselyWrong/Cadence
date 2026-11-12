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
            payload("""{"suggestion_uid":"s3","entity":"note","item_uid":"l1","title":"x","priority":{"value":5,"confidence":0.9}}"""),
        )!!

        assertNull(card.priority)
    }

    @Test
    fun aClassifyPayloadWithoutItsIdentityIsRefusedNotCrashed() {
        assertNull(AutoClassifyPayload.classify(payload("""{"entity":"task","title":"sans identifiant"}""")))
        assertNull(AutoClassifyPayload.classify(null))
    }

    @Test
    fun aSuggestionListEntryIsParsedAndAnEmptyOneIsSkipped() {
        val entry = json.parseToJsonElement(
            """{"uid":"s9","kind":"classify","entity":"task","item_uid":"t9","payload":{"title":"Payer"},"created_at":"x","expires_at":"y"}""",
        )
        val parsed = PendingSuggestion.parse(entry)!!

        assertEquals("Payer", parsed.headline)
        assertNull(PendingSuggestion.parse(json.parseToJsonElement("""{"kind":"classify"}""")))
    }

    @Test
    fun aDryRunCountsOnlyWhatWouldBeWritten() {
        val result = DryRunResult.of(
            payload(
                """
                {"run_id":"r","considered":4,"results":[
                  {"uid":"a","outcome":"dry_run"},{"uid":"b","outcome":"nothing"},
                  {"uid":"c","outcome":"changed"},{"uid":"d","outcome":"dry_run"}]}
                """,
            ),
        )

        assertEquals(4, result.considered)
        assertEquals(2, result.wouldChange)
        assertNull(result.error)
    }

    @Test
    fun theSettingsCarryTheLastApiErrorAndTheFailedCount() {
        val settings = ClassifySettings.of(
            payload(
                """
                {"settings":{},"defaults":{},"ai_configured":true,
                 "health":{"last_error":{"message":"401: invalid x-api-key","at":"2026-11-08T07:30:00.000Z"},"retryable":3}}
                """,
            ),
        )

        assertEquals(ClassifyHealth("401: invalid x-api-key", "2026-11-08T07:30:00.000Z", 3), settings.health)
        assertEquals(true, settings.health.shown)
    }

    @Test
    fun aHealthyServerShowsNoBanner() {
        val quiet = ClassifySettings.of(payload("""{"health":{"last_error":null,"retryable":0}}"""))
        val older = ClassifySettings.of(payload("""{"settings":{}}"""))

        assertEquals(false, quiet.health.shown)
        assertEquals(false, older.health.shown)
    }
}
