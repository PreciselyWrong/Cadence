package ch.nicolab.cadence.tasks.proposals

import java.io.File
import java.time.LocalDate
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

class WeekendModelTest {
    /** Proposition `weekend` telle que `GET /api/proposals/:uid` la renvoie (`docs/48-weekend.md`). */
    private val proposalJson = Json.parseToJsonElement(
        """
        {"uid":"w1","kind":"weekend","status":"ready","created_at":"2026-11-13T17:00:00Z",
         "answer":{"headline":"Samedi sec, dimanche pluvieux.","subtitle":"Deux sorties possibles.",
           "days":[{"date":"2026-11-14","weather":"sun","min":2,"max":10},{"date":"2026-11-15","weather":"rain","min":4,"max":7}],
           "slots":[
             {"id":"s1","date":"2026-11-14","part":"morning","weather":"sun","temp":5,"feels":2,"recommended":true,
              "activity":{"title":"Marché de Morges","url":"https://example.org/m","image":"https://example.org/m.jpg","place":"Morges, Place du Marché","note":"Fromages","travel":"20 min","start":"09:00","end":"12:00"}},
             {"id":"s2","date":"2026-11-14","part":"afternoon","busy":"Foire aux livres, Penthalaz"},
             {"id":"s3","date":"2026-11-15","part":"morning","activity":{"title":"Musée","url":"http://insecure.example","image":"http://insecure.example/i.jpg"},"decision":{"op":"skip"}},
             {"id":"s4","date":"2026-11-15","part":"evening","activity":{"title":"Créneau invalide"}},
             {"id":"s5","date":"2026-11-15","part":"day","activity":{"title":"Piscine","after":"Ensuite : balade à Dizy"},
              "decision":{"op":"calendar","note":"ok"},"event":{"state":"created","link":"https://calendar.google.com/e/1"}},
             {"id":"s6","date":"2026-11-14","part":"day","activity":{"title":"Vélo"},"decision":{"op":"other","note":"plutôt la piscine"}}
           ],
           "nearby":[
             {"title":"Atelier céramique","date":"2026-11-14","start":"14:00","place":"La Sarraz","travel":"5 min","url":"https://example.org/a","image":"https://example.org/a.jpg","note":"Entrée libre"},
             {"title":"Hors week-end","date":"2026-11-20","place":"Yverdon"},
             {"title":"Marché","date":"2026-11-15","place":"Cossonay","image":"http://insecure.example/x.jpg"},
             {"title":"Concert","date":"2026-11-14","start":"20:00"}
           ],
           "elsewhere":[{"place":"Pontarlier","date":"2026-11-14","weather":"sun","temp":10,"travel":"1 h"}]}}
        """.trimIndent(),
    ).jsonObject

    private val proposal: WeekendProposal get() = WeekendModel.parseProposal(proposalJson)!!

    private fun slot(id: String) = proposal.slots.first { it.id == id }

    @Test
    fun parsesAnswerAndDropsBadSlotsAndInsecureLinks() {
        assertEquals("Samedi sec, dimanche pluvieux.", proposal.headline)
        assertEquals(listOf(LocalDate.of(2026, 11, 14), LocalDate.of(2026, 11, 15)), proposal.days.map { it.date })
        assertEquals(WeekendWeather.SUN, proposal.days[0].weather)
        assertEquals(listOf("s1", "s2", "s3", "s5", "s6"), proposal.slots.map { it.id })
        assertEquals("https://example.org/m", slot("s1").activity?.url)
        assertEquals("https://example.org/m.jpg", slot("s1").activity?.image)
        assertEquals("Morges, Place du Marché", slot("s1").activity?.place)
        assertEquals("09:00", slot("s1").activity?.start)
        assertNull(slot("s3").activity?.url)
        assertNull(slot("s3").activity?.image)
        assertEquals(3, proposal.nearby.size)
        assertEquals("https://example.org/a.jpg", proposal.nearby[0].image)
        assertNull(proposal.nearby[1].image)
        assertNull(slot("s2").activity)
        assertEquals("Foire aux livres, Penthalaz", slot("s2").busy)
        assertEquals(WeekendOp.CALENDAR, slot("s5").decision?.op)
        assertEquals(WeekendEventState.CREATED, slot("s5").event?.state)
        assertEquals("Pontarlier", proposal.elsewhere.single().place)
    }

    @Test
    fun onlyActivitiesWithoutFinalDecisionAreOpen() {
        assertTrue(slot("s1").isOpen)
        assertTrue(slot("s6").isOpen)
        assertEquals(false, slot("s2").isOpen)
        assertEquals(false, slot("s3").isOpen)
        assertEquals(false, slot("s5").isOpen)
    }

    @Test
    fun newestReadyIgnoresOtherStatusesAndTakesTheLatest() {
        val list = WeekendModel.parseList(
            Json.parseToJsonElement(
                """
                {"proposals":[
                  {"uid":"a","status":"ready","created_at":"2026-11-06T17:00:00Z","answer":{"headline":"Ancienne"}},
                  {"uid":"b","status":"pending","created_at":"2026-11-13T17:00:00Z"},
                  {"uid":"c","status":"applied","created_at":"2026-11-12T17:00:00Z"},
                  {"uid":"d","status":"ready","created_at":"2026-11-13T09:00:00Z","answer":{"headline":"Récente"}}
                ]}
                """.trimIndent(),
            ).jsonObject,
        )
        assertEquals(listOf("a", "b", "c", "d"), list.map { it.uid })
        assertEquals("d", WeekendModel.newestReady(list)?.uid)
        assertNull(WeekendModel.newestReady(emptyList()))
    }

    @Test
    fun startDraftPreselectsOnlyRecommendedOpenSlots() {
        val draft = WeekendModel.startDraft(proposal)
        assertEquals("w1", draft.uid)
        assertEquals(mapOf("s1" to WeekendOp.CALENDAR), draft.picks)
    }

    @Test
    fun tapTogglesSwitchesAndIgnoresClosedSlots() {
        val start = WeekendModel.startDraft(proposal)
        assertEquals(mapOf("s1" to WeekendOp.SKIP), start.tap(slot("s1"), WeekendOp.SKIP).picks)
        assertEquals(emptyMap<String, WeekendOp>(), start.tap(slot("s1"), WeekendOp.CALENDAR).picks)
        assertEquals(start.picks, start.tap(slot("s2"), WeekendOp.CALENDAR).picks)
        assertEquals(start.picks, start.tap(slot("s5"), WeekendOp.SKIP).picks)
        assertEquals(mapOf("s1" to WeekendOp.CALENDAR, "s6" to WeekendOp.OTHER), start.tap(slot("s6"), WeekendOp.OTHER).picks)
    }

    @Test
    fun notesAreTrimmedCutAndBlankNotesDropped() {
        val draft = WeekendModel.startDraft(proposal).withNote("s1", "x".repeat(600))
        assertEquals(WeekendModel.NOTE_MAX_LENGTH, draft.noteOf("s1").length)
        assertEquals("", draft.withNote("s1", "   ").noteOf("s1"))
    }

    @Test
    fun applyBodySendsEveryPickWithItsNoteOnly() {
        val draft = WeekendModel.startDraft(proposal)
            .withNote("s1", "  pas trop tôt  ")
            .tap(slot("s6"), WeekendOp.OTHER)
            .withNote("s6", "   ")
        val decisions = WeekendModel.applyBody(draft)["decisions"]!!.jsonArray.map { it.jsonObject }
        assertEquals(listOf("s1", "s6"), decisions.map { it["slot_id"]!!.jsonPrimitive.content })
        assertEquals(listOf("calendar", "other"), decisions.map { it["op"]!!.jsonPrimitive.content })
        assertEquals("pas trop tôt", decisions[0]["note"]!!.jsonPrimitive.content)
        assertNull(decisions[1]["note"])
    }

    @Test
    fun countsGiveTheFooterLine() {
        val draft = WeekendModel.startDraft(proposal)
            .tap(slot("s6"), WeekendOp.OTHER)
            .tap(slot("s1"), WeekendOp.SKIP)
        assertEquals(WeekendCounts(calendar = 0, other = 1, skip = 1), WeekendModel.countsOf(draft))
    }

    @Test
    fun reconcileKeepsOpenPicksOfTheSameProposalAndRestartsOtherwise() {
        val kept = WeekendDraft(uid = "w1", picks = mapOf("s1" to WeekendOp.SKIP, "s5" to WeekendOp.SKIP))
        assertEquals(mapOf("s1" to WeekendOp.SKIP), WeekendModel.reconcile(kept, proposal).picks)
        val restarted = WeekendDraft(uid = "old", picks = mapOf("s6" to WeekendOp.OTHER))
        assertEquals(mapOf("s1" to WeekendOp.CALENDAR), WeekendModel.reconcile(restarted, proposal).picks)
    }

    @Test
    fun formatsActivityAndNearbyMetaLinesAndGroupsNearbyByDay() {
        assertEquals(
            "Morges, Place du Marché · 09:00 · 20 min",
            WeekendModel.activityMetaLine(slot("s1").activity!!),
        )
        assertEquals(
            "samedi 14:00 · La Sarraz · 5 min",
            WeekendModel.nearbyMetaLine(proposal.nearby[0], "samedi"),
        )
        assertEquals(
            "dimanche · Cossonay",
            WeekendModel.nearbyMetaLine(proposal.nearby[1], "dimanche"),
        )
        val groups = WeekendModel.groupNearbyByDay(proposal.nearby)
        assertEquals(listOf(LocalDate.of(2026, 11, 14), LocalDate.of(2026, 11, 15)), groups.map { it.first })
        assertEquals(listOf("Atelier céramique", "Concert"), groups[0].second.map { it.title })
        assertEquals(listOf("Marché"), groups[1].second.map { it.title })
    }

    @Test
    fun pickStateSelectsPendingFailedAndShownWithRequestDates() {
        val list = WeekendModel.parseList(
            Json.parseToJsonElement(
                """
                {"proposals":[
                  {"uid":"p1","status":"pending","created_at":"2026-11-22T10:00:00Z","request":{"dates":["2026-11-28","2026-11-29"]},"answer":null},
                  {"uid":"r1","status":"applied","created_at":"2026-11-20T17:00:00Z","answer":{"headline":"Ancien","days":[{"date":"2026-11-21"}]}},
                  {"uid":"f1","status":"failed","created_at":"2026-11-21T10:00:00Z","error":"timeout","request":{"dates":["2026-11-28"]}}
                ]}
                """.trimIndent(),
            ).jsonObject,
        )
        val state = WeekendModel.pickState(list)
        assertEquals("p1", state.pending?.uid)
        assertEquals(listOf(LocalDate.of(2026, 11, 28), LocalDate.of(2026, 11, 29)), state.pending?.requestedDates)
        assertEquals("r1", state.shown?.uid)
        assertNull(state.failed)

        val failedOnly = WeekendModel.pickState(list.drop(1))
        assertNull(failedOnly.pending)
        assertEquals("f1", failedOnly.failed?.uid)
        assertEquals("timeout", failedOnly.failed?.error)
        assertEquals("r1", failedOnly.shown?.uid)
    }

    @Test
    fun createWeekendBodySerializesKindAndDates() {
        val body = createWeekendBody(listOf(LocalDate.of(2026, 11, 28), LocalDate.of(2026, 11, 29)))
        assertEquals("weekend", body["kind"]!!.jsonPrimitive.content)
        assertEquals(listOf("2026-11-28", "2026-11-29"), body["dates"]!!.jsonArray.map { it.jsonPrimitive.content })
    }

    private val fixture by lazy {
        generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "fixtures/weekend/request-and-share.json") }
            .first { it.isFile }
            .let { Json.parseToJsonElement(it.readText()).jsonObject }
    }

    @TestFactory
    fun `rejoue fixtures weekend defaultDays`(): List<DynamicTest> =
        fixture.getValue("defaultDays").jsonArray.mapIndexed { idx, elem ->
            val obj = elem.jsonObject
            val today = obj.getValue("today").jsonPrimitive.content
            DynamicTest.dynamicTest("defaultDays #$idx ($today)") {
                val expected = obj.getValue("expect").jsonArray.map { LocalDate.parse(it.jsonPrimitive.content) }
                assertEquals(expected, WeekendModel.defaultDays(LocalDate.parse(today)))
            }
        }

    @TestFactory
    fun `rejoue fixtures weekend toggle`(): List<DynamicTest> =
        fixture.getValue("toggle").jsonArray.mapIndexed { idx, elem ->
            val obj = elem.jsonObject
            val date = obj.getValue("date").jsonPrimitive.content
            DynamicTest.dynamicTest("toggle #$idx ($date)") {
                val selected = obj.getValue("selected").jsonArray.map { LocalDate.parse(it.jsonPrimitive.content) }
                val expected = obj.getValue("expect").jsonArray.map { LocalDate.parse(it.jsonPrimitive.content) }
                assertEquals(expected, WeekendModel.toggleDay(selected, LocalDate.parse(date)))
            }
        }

    @TestFactory
    fun `rejoue fixtures weekend pickerDays`(): List<DynamicTest> =
        fixture.getValue("pickerDays").jsonArray.mapIndexed { idx, elem ->
            val obj = elem.jsonObject
            val today = obj.getValue("today").jsonPrimitive.content
            DynamicTest.dynamicTest("pickerDays #$idx ($today)") {
                val expected = obj.getValue("expect").jsonArray.map { LocalDate.parse(it.jsonPrimitive.content) }
                assertEquals(expected, WeekendModel.pickerDays(LocalDate.parse(today)))
            }
        }

    @TestFactory
    fun `rejoue fixtures weekend share`(): List<DynamicTest> =
        fixture.getValue("share").jsonArray.map { elem ->
            val obj = elem.jsonObject
            val name = obj.getValue("name").jsonPrimitive.content
            DynamicTest.dynamicTest("share: $name") {
                val parsed = WeekendModel.parseProposal(
                    kotlinx.serialization.json.buildJsonObject {
                        put("uid", kotlinx.serialization.json.JsonPrimitive("w-share"))
                        put("status", kotlinx.serialization.json.JsonPrimitive("ready"))
                        put("answer", obj.getValue("answer"))
                    },
                )!!
                val picks = obj.getValue("picks").jsonObject.mapValues { (_, v) -> WeekendOp.of(v.jsonPrimitive.content)!! }
                val expected = obj.getValue("expect").jsonArray.map { dayElem ->
                    val d = dayElem.jsonObject
                    ShareDay(
                        date = LocalDate.parse(d.getValue("date").jsonPrimitive.content),
                        weather = WeekendWeather.of(d["weather"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content),
                        min = d["min"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.int,
                        max = d["max"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.int,
                        items = d.getValue("items").jsonArray.map { itemElem ->
                            val item = itemElem.jsonObject
                            ShareItem(
                                id = item.getValue("id").jsonPrimitive.content,
                                part = WeekendPart.of(item.getValue("part").jsonPrimitive.content)!!,
                                title = item.getValue("title").jsonPrimitive.content,
                                place = item["place"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content,
                                start = item["start"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content,
                                travel = item["travel"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content,
                                state = ShareItemState.entries.first { it.wire == item.getValue("state").jsonPrimitive.content },
                            )
                        },
                    )
                }
                assertEquals(expected, WeekendModel.shareDays(parsed, picks))
            }
        }

    @TestFactory
    fun `rejoue fixtures weekend dominant`(): List<DynamicTest> =
        fixture.getValue("dominant").jsonArray.mapIndexed { idx, elem ->
            val obj = elem.jsonObject
            val expect = obj.getValue("expect").jsonPrimitive.content
            DynamicTest.dynamicTest("dominant #$idx -> $expect") {
                val weathers = obj.getValue("days").jsonArray.map { dayElem ->
                    WeekendWeather.of(dayElem.jsonObject["weather"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content)
                }
                assertEquals(WeekendWeather.of(expect), WeekendModel.dominantWeatherOf(weathers))
            }
        }
}
