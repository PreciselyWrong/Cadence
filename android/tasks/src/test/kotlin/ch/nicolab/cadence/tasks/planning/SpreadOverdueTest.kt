package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.tasks.model.TaskItem
import java.io.File
import java.time.LocalDate
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory

/** Rejoue fixtures/plan/spread-overdue.json ; le jumeau web est frontend/components/Upcoming/__tests__/spreadOverdue.test.ts. */
class SpreadOverdueTest {
    private val fixture: JsonObject = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "fixtures/plan/spread-overdue.json") }
        .first { it.isFile }
        .let { Json.parseToJsonElement(it.readText()).jsonObject }

    private fun JsonElement.str(key: String): String = jsonObject.getValue(key).jsonPrimitive.content

    private fun JsonElement.minutes(): Int? = jsonObject["estimated_minutes"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.int

    private fun priority(element: JsonElement): Int? = when (element.jsonObject["priority"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content) {
        "low" -> 0
        "medium" -> 1
        "high" -> 2
        else -> null
    }

    @TestFactory
    fun `étaler sur 7 jours suit les cas partagés avec le web`(): List<DynamicTest> =
        fixture.getValue("cases").jsonArray.map { case ->
            DynamicTest.dynamicTest(case.str("name")) {
                val overdue = case.jsonObject.getValue("overdue").jsonArray.map {
                    TaskItem(
                        uid = it.str("uid"),
                        name = it.str("uid"),
                        priority = priority(it),
                        dueDay = LocalDate.parse(it.str("due_date").take(10)),
                        estimatedMinutes = it.minutes(),
                    )
                }
                val planned = case.jsonObject.getValue("planned").jsonObject.map { (date, tasks) ->
                    LocalDate.parse(date) to tasks.jsonArray.map { it.minutes() }
                }.toMap()
                val expected = case.jsonObject.getValue("expect").jsonArray.map { it.str("uid") to LocalDate.parse(it.str("date")) }
                assertEquals(expected, PlanBoard.spread(overdue, planned, LocalDate.parse(case.str("today"))))
            }
        }
}
