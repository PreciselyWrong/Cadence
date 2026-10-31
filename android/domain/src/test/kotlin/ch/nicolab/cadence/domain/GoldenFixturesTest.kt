package ch.nicolab.cadence.domain

import java.io.File
import java.math.BigDecimal
import java.time.DayOfWeek
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory

/**
 * Rejoue les fichiers JSON de fixtures/habits (voir son README). Le jumeau JavaScript est
 * backend/tests/unit/habits/goldenFixtures.test.js : les deux moteurs doivent réussir les
 * mêmes cas, sinon une règle a divergé.
 */
class GoldenFixturesTest {

    private val dir: File = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "fixtures/habits") }
        .first { it.isDirectory }

    @TestFactory
    fun `golden fixtures`(): List<DynamicTest> {
        val files = dir.listFiles { f -> f.name.endsWith(".json") }!!.sortedBy { it.name }
        assertTrue(files.size >= 8, "fixture files not found in $dir")
        return files.flatMap { file ->
            val root = Json.parseToJsonElement(file.readText()).jsonObject
            val suite = root.getValue("suite").jsonPrimitive.content
            val cases = root.getValue("cases").jsonArray.map { it.jsonObject }
            assertEquals(cases.size, cases.map { it.getValue("name").jsonPrimitive.content }.toSet().size, "duplicate names in ${file.name}")
            cases.map { case ->
                val name = case.getValue("name").jsonPrimitive.content
                DynamicTest.dynamicTest("$suite: $name") {
                    val actual = run(case)
                    subset(actual, case.getValue("expect"), name)
                }
            }
        }
    }

    // --- Décodage -------------------------------------------------------------------------

    private fun JsonObject.str(key: String): String? = this[key]?.takeIf { it !is JsonNull }?.jsonPrimitive?.content
    private fun JsonObject.long(key: String): Long? = this[key]?.takeIf { it !is JsonNull }?.jsonPrimitive?.long
    private fun JsonObject.obj(key: String): JsonObject? = this[key]?.takeIf { it !is JsonNull }?.jsonObject
    private fun JsonObject.bool(key: String): Boolean? = this[key]?.takeIf { it !is JsonNull }?.jsonPrimitive?.boolean

    private fun progression(json: JsonObject?): GoalProgression? = json?.let {
        GoalProgression(
            step = it.long("step")!!,
            cadence = ProgressionCadence.valueOf(it.str("cadence")!!),
            capMinor = it.long("capMinor"),
            startsOn = LocalDate.parse(it.str("startsOn")!!),
        )
    }

    private fun unit(json: JsonObject?): MeasurementUnit? = json?.let {
        MeasurementUnit(
            id = it.str("id")!!,
            dimension = UnitDimension.valueOf(it.str("dimension") ?: "CUSTOM"),
            nameFr = it.str("nameFr") ?: "",
            symbol = it.str("symbol") ?: "",
            scaleToCanonical = it.long("scaleToCanonical") ?: 1L,
        )
    }

    private fun goal(json: JsonObject) = HabitGoal(
        targetMinor = json.long("targetMinor")!!,
        period = PeriodType.valueOf(json.str("period")!!),
        goalType = GoalType.valueOf(json.str("goalType") ?: "QUANTITY"),
        unit = unit(json.obj("unit")),
        frequencyTarget = json["frequencyTarget"]?.takeIf { it !is JsonNull }?.jsonPrimitive?.int,
        minimumMinor = json.long("minimumMinor"),
        direction = GoalDirection.valueOf(json.str("direction") ?: "AT_LEAST"),
        progression = progression(json.obj("progression")),
    )

    private fun schedule(json: JsonObject?): HabitSchedule {
        if (json == null) return HabitSchedule()
        return HabitSchedule(
            mode = ScheduleMode.valueOf(json.str("mode") ?: "SELECTED_DAYS"),
            activeDays = json["activeDays"]?.jsonArray?.map { DayOfWeek.valueOf(it.jsonPrimitive.content) }?.toSet()
                ?: DayOfWeek.entries.toSet(),
            firstDayOfWeek = DayOfWeek.valueOf(json.str("firstDayOfWeek") ?: "MONDAY"),
            intervalDays = json["intervalDays"]?.jsonPrimitive?.int ?: 2,
        )
    }

    private fun habit(json: JsonObject) = HabitDefinition(
        id = json.str("id") ?: "h",
        startsOn = json.str("startsOn")?.let(LocalDate::parse) ?: LocalDate.of(1970, 1, 1),
        active = json.bool("active") ?: true,
        archived = json.bool("archived") ?: false,
        goal = goal(json.getValue("goal").jsonObject),
        schedule = schedule(json.obj("schedule")),
    )

    private fun habitAt(case: JsonObject): Pair<String, (LocalDate) -> HabitDefinition?> {
        val versions = case["versions"]?.jsonArray?.map {
            val v = it.jsonObject
            LocalDate.parse(v.str("effectiveFrom")!!) to habit(v.getValue("habit").jsonObject)
        } ?: listOf(LocalDate.of(1970, 1, 1) to habit(case.getValue("habit").jsonObject))
        val sorted = versions.sortedBy { it.first }
        val id = sorted.firstOrNull()?.second?.id ?: "h"
        return id to { date -> sorted.lastOrNull { it.first <= date }?.second }
    }

    private fun entries(case: JsonObject, habitId: String): List<HabitEntry> =
        case["entries"]?.jsonArray?.mapIndexed { index, element ->
            val e = element.jsonObject
            val date = LocalDate.parse(e.str("localDate")!!)
            HabitEntry(
                id = "entry-$index",
                habitId = e.str("habitId") ?: habitId,
                occurredAt = date.atStartOfDay().toInstant(ZoneOffset.UTC),
                localDate = date,
                observedZoneId = ZoneOffset.UTC,
                valueMinor = e.long("valueMinor")!!,
                sessionId = e.str("sessionId"),
            )
        } ?: emptyList()

    private fun pause(json: JsonObject) = HabitPause(
        start = LocalDate.parse(json.str("start")!!),
        endExclusive = json.str("endExclusive")?.let(LocalDate::parse),
        reason = json.str("reason")?.let { PauseReason.valueOf(it) },
        reasonLabel = json.str("reasonLabel"),
    )

    private fun pauses(case: JsonObject): List<HabitPause> =
        case["pauses"]?.jsonArray?.map { pause(it.jsonObject) } ?: emptyList()

    // --- Exécution ------------------------------------------------------------------------

    private fun run(case: JsonObject): JsonElement {
        fun date(key: String) = LocalDate.parse(case.str(key)!!)
        return when (val kind = case.getValue("kind").jsonPrimitive.content) {
            "evaluate" -> {
                val habit = habit(case.getValue("habit").jsonObject)
                evaluation(HabitEvaluator().evaluate(habit, date("date"), entries(case, habit.id), pauses(case)))
            }
            "streak" -> {
                val (id, at) = habitAt(case)
                val max = case["maxPeriods"]?.jsonPrimitive?.intOrNull
                val streak = if (max == null) {
                    StreakCalculator.compute(at, date("today"), entries(case, id), pauses(case))
                } else {
                    StreakCalculator.compute(at, date("today"), entries(case, id), pauses(case), max)
                }
                buildJsonObject {
                    put("current", streak.current)
                    put("best", streak.best)
                }
            }
            "statistics" -> {
                val (id, at) = habitAt(case)
                summary(HabitStatisticsSummary.compute(at, date("today"), entries(case, id), pauses(case)))
            }
            "activity" -> {
                val id = case.str("habitId")!!
                activity(HabitActivityStats.compute(id, date("startsOn"), date("today"), entries(case, id)))
            }
            "target_at" -> buildJsonObject {
                put("targetMinor", goal(case.getValue("goal").jsonObject).targetAt(date("date")))
            }
            "goal_invalid" -> buildJsonObject {
                put("error", runCatching { goal(case.getValue("goal").jsonObject) }.isFailure)
            }
            "window" -> {
                val window = PeriodCalculator.window(
                    date("date"),
                    PeriodType.valueOf(case.str("period")!!),
                    DayOfWeek.valueOf(case.str("firstDayOfWeek") ?: "MONDAY"),
                )
                buildJsonObject {
                    put("start", window.start.toString())
                    put("endExclusive", window.endExclusive.toString())
                }
            }
            "is_planned" -> buildJsonObject {
                put("planned", isPlannedOn(habit(case.getValue("habit").jsonObject), date("date")))
            }
            "pause" -> {
                val pause = pause(case.getValue("pause").jsonObject)
                val on = date("date")
                val resumed = pause.resumedOn(on)
                buildJsonObject {
                    put("includes", pause.includes(on))
                    put("isSingleDay", pause.isSingleDay)
                    put("isCancellableOn", pause.isCancellableOn(on))
                    put(
                        "resumedOn",
                        resumed?.let {
                            buildJsonObject {
                                put("start", it.start.toString())
                                put("endExclusive", it.endExclusive?.toString())
                            }
                        } ?: JsonNull,
                    )
                }
            }
            "group_active" -> {
                val g = case.getValue("group").jsonObject
                val group = HabitGroup(
                    id = "g",
                    name = "g",
                    startMinute = g["startMinute"]?.takeIf { it !is JsonNull }?.jsonPrimitive?.int,
                    endMinute = g["endMinute"]?.takeIf { it !is JsonNull }?.jsonPrimitive?.int,
                    sortOrder = 0,
                )
                buildJsonObject { put("active", group.isActiveAt(LocalTime.parse(case.str("time")!!))) }
            }
            "timer" -> {
                val t = case.getValue("timer").jsonObject
                val timer = HabitTimer("h", t.long("accumulatedSeconds")!!, t.str("runningSince")?.let(Instant::parse))
                buildJsonObject {
                    put("elapsedSeconds", timer.elapsedSecondsAt(Instant.parse(case.str("now")!!)))
                    put("isRunning", timer.isRunning)
                }
            }
            "timer_attainment" -> buildJsonObject {
                put(
                    "attainment",
                    HabitTimer.attainmentOf(
                        goal(case.getValue("goal").jsonObject),
                        case.long("progressMinor")!!,
                        case.long("elapsedSeconds")!!,
                    ).name,
                )
            }
            else -> error("Unknown fixture kind: $kind")
        }
    }

    private fun evaluation(e: HabitEvaluation) = buildJsonObject {
        put(
            "period",
            buildJsonObject {
                put("start", e.period.start.toString())
                put("endExclusive", e.period.endExclusive.toString())
            },
        )
        put("progressMinor", e.progressMinor)
        put("completedQuantity", e.completedQuantity)
        put("reachedMinimum", e.reachedMinimum)
        put("validatesPeriod", e.validatesPeriod)
        put("attainment", e.attainment.name)
        put("targetMinor", e.targetMinor)
        put("limitStatus", e.limitStatus?.name)
        put("sessionCount", e.sessionCount)
        put("completedFrequency", e.completedFrequency)
        put("isCompleted", e.isCompleted)
        put("isPaused", e.isPaused)
        put("isPlannedForDate", e.isPlannedForDate)
        put("needsAttentionNow", e.needsAttentionNow)
        put("requiresAction", e.requiresAction)
        put("countsAsFailure", e.countsAsFailure)
    }

    private fun summary(s: HabitStatisticsSummary) = buildJsonObject {
        put("evaluatedPeriods", s.evaluatedPeriods)
        put("validatedPeriods", s.validatedPeriods)
        put("idealPeriods", s.idealPeriods)
        put("previousEvaluatedPeriods", s.previousEvaluatedPeriods)
        put("previousValidatedPeriods", s.previousValidatedPeriods)
        put("previousIdealPeriods", s.previousIdealPeriods)
        put("observablePeriods", s.observablePeriods)
        put("previousObservablePeriods", s.previousObservablePeriods)
        put("periodType", s.periodType?.name)
        put("isHomogeneous", s.isHomogeneous)
        put("successRatePercent", s.successRatePercent)
        put("trendPercentagePoints", s.trendPercentagePoints)
        put("confidence", s.confidence.name)
        put("from", s.from.toString())
        put("untilExclusive", s.untilExclusive.toString())
        put("previousFrom", s.previousFrom.toString())
        put(
            "comparison",
            s.comparison?.let {
                buildJsonObject {
                    put("currentRatePercent", it.currentRatePercent)
                    put("previousRatePercent", it.previousRatePercent)
                    put("deltaPercentagePoints", it.deltaPercentagePoints)
                    put("trend", it.trend.name)
                }
            } ?: JsonNull,
        )
        put("dayStatuses", buildJsonObject { s.days.forEach { put(it.date.toString(), it.status.name) } })
        put("calendarDayStatuses", buildJsonObject { s.calendarDays.forEach { put(it.date.toString(), it.status.name) } })
        put("calendarDaysCount", s.calendarDays.size)
        put(
            "periods",
            JsonArray(
                s.periods.map {
                    buildJsonObject {
                        put("start", it.start.toString())
                        put("endExclusive", it.endExclusive.toString())
                        put("periodType", it.periodType.name)
                        put("status", it.status.name)
                    }
                },
            ),
        )
    }

    private fun activity(a: HabitActivityStats) = buildJsonObject {
        put("entries30", a.entries30)
        put("activeDays30", a.activeDays30)
        put("totalMinor30", a.totalMinor30)
        put("peakDayMinor30", a.peakDayMinor30)
        put("averagePerActiveDayMinor30", a.averagePerActiveDayMinor30)
        put("calendarDays30", a.calendarDays30)
        put("entries90", a.entries90)
        put("activeDays90", a.activeDays90)
        put("totalMinor90", a.totalMinor90)
        put("calendarDays90", a.calendarDays90)
        put("entries365", a.entries365)
        put("activeDays365", a.activeDays365)
        put("totalMinor365", a.totalMinor365)
        put("calendarDays365", a.calendarDays365)
        put("entriesAllTime", a.entriesAllTime)
        put("activeDaysAllTime", a.activeDaysAllTime)
        put("totalMinorAllTime", a.totalMinorAllTime)
        put("calendarDaysAllTime", a.calendarDaysAllTime)
    }

    // --- Comparaison ----------------------------------------------------------------------

    /** Chaque clé attendue doit concorder ; les listes concordent élément par élément. */
    private fun subset(actual: JsonElement?, expected: JsonElement, label: String) {
        when (expected) {
            is JsonNull -> assertTrue(actual == null || actual is JsonNull, "$label: expected null, got $actual")
            is JsonObject -> {
                val obj = actual as? JsonObject ?: error("$label: expected an object, got $actual")
                expected.forEach { (key, value) -> subset(obj[key], value, "$label.$key") }
            }
            is JsonArray -> {
                val array = actual as? JsonArray ?: error("$label: expected an array, got $actual")
                assertEquals(expected.size, array.size, "$label: length")
                expected.forEachIndexed { i, item -> subset(array[i], item, "$label[$i]") }
            }
            is JsonPrimitive -> {
                val got = actual as? JsonPrimitive ?: error("$label: expected $expected, got $actual")
                if (expected.isString) {
                    assertEquals(expected.content, got.content, label)
                } else if (expected.content == "true" || expected.content == "false") {
                    assertEquals(expected.content, got.content, label)
                } else {
                    assertEquals(0, BigDecimal(expected.content).compareTo(BigDecimal(got.content)), "$label: expected ${expected.content}, got ${got.content}")
                }
            }
        }
    }
}
