package ch.nicolab.cadence.tasks.breakdown

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BreakdownSettingsFormTest {
    private val values = Json.parseToJsonElement(
        """{"enabled":true,"model":"gpt-x","max_steps":6,"min_step_minutes":5,"max_step_minutes":25,"note_chars":1500,"max_tokens":800}""",
    ) as JsonObject

    private fun form(change: (BreakdownForm) -> BreakdownForm = { it }) = change(BreakdownSettingsForm.fromSettings(values))

    @Test
    fun theServerValuesFillTheForm() {
        val form = form()

        assertTrue(form.enabled)
        assertEquals("gpt-x", form.model)
        assertEquals("6", form.numbers.getValue("max_steps"))
        assertEquals("1500", form.numbers.getValue("note_chars"))
        assertEquals(BreakdownSettingsForm.NUMBER_KEYS.toSet(), form.numbers.keys)
    }

    @Test
    fun aValidFormBecomesThePutBodyWithATrimmedModel() {
        val body = BreakdownSettingsForm.build(form { it.copy(model = "  m  ", enabled = false) }).getOrThrow()

        assertEquals("false", body.getValue("enabled").jsonPrimitive.content)
        assertEquals("m", body.getValue("model").jsonPrimitive.content)
        assertEquals("6", body.getValue("max_steps").jsonPrimitive.content)
        assertEquals("800", body.getValue("max_tokens").jsonPrimitive.content)
    }

    @Test
    fun aBlankModelMeansTheProviderModel() {
        val body = BreakdownSettingsForm.build(form { it.copy(model = "") }).getOrThrow()

        assertEquals("", body.getValue("model").jsonPrimitive.content)
    }

    @Test
    fun aNonNumberIsRefusedAndNamesTheField() {
        val failure = BreakdownSettingsForm.build(form { it.copy(numbers = it.numbers + ("max_tokens" to "beaucoup")) })

        assertEquals("max_tokens", failure.exceptionOrNull()?.message)
    }

    @Test
    fun everyNumberKeepsItsServerBounds() {
        val cases = mapOf(
            "max_steps" to listOf("1", "16"),
            "min_step_minutes" to listOf("4", "61"),
            "max_step_minutes" to listOf("4", "241"),
            "note_chars" to listOf("-1", "10001"),
            "max_tokens" to listOf("199", "8001"),
        )
        cases.forEach { (key, outside) ->
            outside.forEach { bad ->
                val failure = BreakdownSettingsForm.build(form { it.copy(numbers = it.numbers + (key to bad)) })
                assertEquals(key, failure.exceptionOrNull()?.message, "$key=$bad")
            }
        }
        val edges = mapOf("max_steps" to "15", "min_step_minutes" to "5", "max_step_minutes" to "240", "note_chars" to "0", "max_tokens" to "200")
        edges.forEach { (key, ok) ->
            assertTrue(BreakdownSettingsForm.build(form { it.copy(numbers = it.numbers + (key to ok)) }).isSuccess, "$key=$ok")
        }
    }

    @Test
    fun aModelOverTwoHundredCharactersIsRefused() {
        val failure = BreakdownSettingsForm.build(form { it.copy(model = "m".repeat(201)) })

        assertEquals("model", failure.exceptionOrNull()?.message)
    }

    @Test
    fun theSmallestStepCannotExceedTheLargest() {
        val failure = BreakdownSettingsForm.build(form { it.copy(numbers = it.numbers + ("min_step_minutes" to "30") + ("max_step_minutes" to "20")) })

        assertEquals("min_step_minutes", failure.exceptionOrNull()?.message)
    }
}
