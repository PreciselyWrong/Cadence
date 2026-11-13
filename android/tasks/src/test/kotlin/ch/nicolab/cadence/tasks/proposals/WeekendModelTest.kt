package ch.nicolab.cadence.tasks.proposals

import java.time.LocalDate
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class WeekendModelTest {
    /** Proposition `weekend` telle que `GET /api/proposals/:uid` la renvoie (`docs/48-weekend.md`). */
    private val proposalJson = Json.parseToJsonElement(
        """
        {"uid":"w1","kind":"weekend","status":"ready","created_at":"2026-11-13T17:00:00Z",
         "answer":{"headline":"Samedi sec, dimanche pluvieux.","subtitle":"Deux sorties possibles.",
           "days":[{"date":"2026-11-14","weather":"sun","min":2,"max":10},{"date":"2026-11-15","weather":"rain","min":4,"max":7}],
           "slots":[
             {"id":"s1","date":"2026-11-14","part":"morning","weather":"sun","temp":5,"feels":2,"recommended":true,
              "activity":{"title":"Marché de Morges","url":"https://example.org/m","note":"Fromages","travel":"20 min","start":"09:00","end":"12:00"}},
             {"id":"s2","date":"2026-11-14","part":"afternoon","busy":"Foire aux livres, Penthalaz"},
             {"id":"s3","date":"2026-11-15","part":"morning","activity":{"title":"Musée","url":"http://insecure.example"},"decision":{"op":"skip"}},
             {"id":"s4","date":"2026-11-15","part":"evening","activity":{"title":"Créneau invalide"}},
             {"id":"s5","date":"2026-11-15","part":"day","activity":{"title":"Piscine","after":"Ensuite : balade à Dizy"},
              "decision":{"op":"calendar","note":"ok"},"event":{"state":"created","link":"https://calendar.google.com/e/1"}},
             {"id":"s6","date":"2026-11-14","part":"day","activity":{"title":"Vélo"},"decision":{"op":"other","note":"plutôt la piscine"}}
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
        assertEquals("09:00", slot("s1").activity?.start)
        assertNull(slot("s3").activity?.url)
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
}
