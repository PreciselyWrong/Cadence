package ch.nicolab.cadence.tasks.autoclassify

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ClassifySettingsFormTest {
    private fun form(
        numbers: Map<String, String> = ClassifySettingsForm.NUMBER_KEYS.associateWith { "3" },
        thresholds: Map<String, String> = ClassifySettingsForm.THRESHOLD_KEYS.associateWith { "0,8" },
        dryRun: Boolean = false,
        excluded: String = " someday , today,, someday ",
    ) = ClassifyForm(
        enabled = true,
        notify = false,
        dryRun = dryRun,
        model = "  ",
        effort = "low",
        numbers = numbers,
        thresholds = thresholds,
        excludedTags = excluded,
    )

    @Test
    fun aValidFormBecomesThePutBody() {
        val body = ClassifySettingsForm.build(form(dryRun = true)).getOrThrow()

        assertEquals("dry_run", body["mode"]!!.jsonPrimitive.content)
        assertEquals("false", body["notify"]!!.jsonPrimitive.content)
        assertEquals("", body["model"]!!.jsonPrimitive.content)
        assertEquals("3", body["batch_size"]!!.jsonPrimitive.content)
        assertEquals("0.8", body.getValue("thresholds").jsonObject["project"]!!.jsonPrimitive.content)
        assertEquals(listOf("someday", "today"), body["excluded_tags"]!!.jsonArray.map { it.jsonPrimitive.content })
    }

    @Test
    fun aNonNumberIsRefusedAndTheFailureNamesTheField() {
        val failure = ClassifySettingsForm.build(form(numbers = ClassifySettingsForm.NUMBER_KEYS.associateWith { "3" } + ("max_tokens" to "beaucoup")))

        assertEquals("max_tokens", failure.exceptionOrNull()?.message)
    }

    @Test
    fun aBadThresholdIsRefusedWithItsName() {
        val failure = ClassifySettingsForm.build(form(thresholds = ClassifySettingsForm.THRESHOLD_KEYS.associateWith { "0,8" } + ("ask" to "")))

        assertEquals("ask", failure.exceptionOrNull()?.message)
    }

    @Test
    fun theServerSettingsAreShownBackInTheForm() {
        val values = Json.parseToJsonElement(
            """{"enabled":true,"notify":false,"mode":"dry_run","model":"m","reasoning_effort":"high",
                "batch_size":12,"thresholds":{"project":0.8,"tags":0.8,"duration":0.6,"priority":0.8,"ask":0.4},
                "excluded_tags":["someday","today"]}""",
        ) as JsonObject

        val shown = ClassifySettingsForm.fromSettings(values)

        assertTrue(shown.dryRun)
        assertFalse(shown.notify)
        assertEquals("high", shown.effort)
        assertEquals("12", shown.numbers["batch_size"])
        assertEquals("0.4", shown.thresholds["ask"])
        assertEquals("someday, today", shown.excludedTags)
    }
}
