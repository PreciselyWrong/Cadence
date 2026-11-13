package ch.nicolab.cadence.tasks.proposals

import java.time.LocalDate
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class CareerModelTest {
    /** Réponse du contrat `docs/47-proposals.md` (carrière), telle que `GET /api/proposals?kind=career&status=ready` la renvoie. */
    private val listJson = """
        {
          "proposals": [
            {
              "uid": "old", "kind": "career", "status": "ready", "created_at": "2026-11-10T07:00:00Z",
              "answer": { "headline": "Ancienne", "followups": [], "offers": [], "tasks": [] },
              "decisions": []
            },
            {
              "uid": "new", "kind": "career", "status": "ready", "created_at": "2026-11-13T07:00:00Z",
              "answer": {
                "headline": "Deux relances, une offre.",
                "subtitle": "Le brouillon de Acme attend ton retour.",
                "stats": [{ "label": "Candidatures", "value": 4 }, { "label": "Relances", "value": "2" }],
                "followups": [
                  { "id": "f1", "title": "Relancer Acme", "company": "Acme", "applied_at": "2026-11-01",
                    "note": "Pas de nouvelles", "draft_url": "https://mail.example.org/d/1", "source_url": "https://jobs.example.org/a" },
                  { "id": "f2", "title": "Relancer Globex" }
                ],
                "offers": [
                  { "id": "o1", "title": "Dév Kotlin", "company": "Initech", "location": "Lausanne", "rate": "90%",
                    "url": "https://jobs.example.org/o1", "expires": "2026-11-20", "fit": "Proche de ton profil.", "source": "rss" },
                  { "id": "o2", "title": "Ingénieur Android", "company": "Umbrella", "url": "https://jobs.example.org/o2", "fit": "Moyen." }
                ],
                "tasks": [{ "id": "t1", "name": "Préparer le CV", "note": "Version anglaise", "due_date": "2026-11-18" }]
              },
              "decisions": [
                { "kind": "offer", "id": "o2", "op": "skip", "note": "Trop loin" },
                { "kind": "followup", "id": "unknown", "op": "done" }
              ]
            }
          ]
        }
    """.trimIndent()

    private fun proposals() = CareerModel.parseList(ProposalJson.parseToJsonElement(listJson).jsonObject)

    @Test
    fun `newest ready career proposal wins`() {
        val picked = CareerModel.newestReady(proposals())
        assertEquals("new", picked?.uid)
    }

    @Test
    fun `no ready career proposal gives nothing`() {
        assertNull(CareerModel.newestReady(emptyList()))
        val pending = proposals().map { it.copy(status = "pending") }
        assertNull(CareerModel.newestReady(pending))
    }

    @Test
    fun `stats accept numbers and strings`() {
        val view = CareerModel.view(proposals().first { it.uid == "new" })
        assertEquals(listOf("Candidatures" to "4", "Relances" to "2"), view.stats.map { it.label to it.value })
        assertEquals("Deux relances, une offre.", view.headline)
        assertEquals("Le brouillon de Acme attend ton retour.", view.subtitle)
    }

    @Test
    fun `decided items leave the open sections`() {
        val view = CareerModel.view(proposals().first { it.uid == "new" })
        assertEquals(listOf("f1", "f2"), view.followups.map { it.id })
        assertEquals(listOf("o1"), view.offers.map { it.id })
        assertEquals(listOf("t1"), view.tasks.map { it.id })
        assertEquals(listOf(CareerKind.OFFER to "o2"), view.decided.map { it.kind to it.id })
        assertEquals(CareerOp.SKIP, view.decided.single().op)
        assertEquals("Ingénieur Android", view.decided.single().title)
    }

    @Test
    fun `decision for an unknown item is ignored`() {
        val view = CareerModel.view(proposals().first { it.uid == "new" })
        assertFalse(view.decided.any { it.id == "unknown" })
    }

    @Test
    fun `empty view when no proposal`() {
        val view = CareerModel.view(null)
        assertTrue(view.isEmpty)
        assertNull(view.headline)
    }

    @Test
    fun `offer fields are parsed with dates and url`() {
        val offer = CareerModel.view(proposals().first { it.uid == "new" }).offers.single()
        assertEquals(LocalDate.of(2026, 11, 20), offer.expires)
        assertEquals("Lausanne", offer.location)
        assertEquals("https://jobs.example.org/o1", offer.url)
    }

    @Test
    fun `only http and https links open`() {
        assertEquals("https://jobs.example.org/o1", CareerModel.safeUrl("https://jobs.example.org/o1"))
        assertEquals("http://example.org", CareerModel.safeUrl(" http://example.org "))
        assertNull(CareerModel.safeUrl("javascript:alert(1)"))
        assertNull(CareerModel.safeUrl("intent://example"))
        assertNull(CareerModel.safeUrl("   "))
        assertNull(CareerModel.safeUrl(null))
    }

    @Test
    fun `an op is valid only for its kind`() {
        assertEquals(CareerOp.APPLY, CareerDecision.of(CareerKind.OFFER, "o1", CareerOp.APPLY)?.op)
        assertNull(CareerDecision.of(CareerKind.OFFER, "o1", CareerOp.CREATE))
        assertNull(CareerDecision.of(CareerKind.FOLLOWUP, "f1", CareerOp.APPLY))
        assertEquals(CareerOp.TASK, CareerDecision.of(CareerKind.FOLLOWUP, "f1", CareerOp.TASK)?.op)
        assertNull(CareerDecision.of(CareerKind.TASK, "t1", CareerOp.DONE))
    }

    @Test
    fun `apply body carries note and due date only when set`() {
        val offer = CareerModel.applyBody(listOf(CareerDecision.of(CareerKind.OFFER, "o1", CareerOp.APPLY, note = "  Bonne piste  ")!!))
        val decision = offer["decisions"]!!.jsonArray.single().jsonObject
        assertEquals("offer", decision["kind"]!!.jsonPrimitive.content)
        assertEquals("o1", decision["id"]!!.jsonPrimitive.content)
        assertEquals("apply", decision["op"]!!.jsonPrimitive.content)
        assertEquals("Bonne piste", decision["note"]!!.jsonPrimitive.content)
        assertNull(decision["due_date"])

        val blank = CareerModel.applyBody(listOf(CareerDecision.of(CareerKind.OFFER, "o1", CareerOp.SKIP, note = "   ")!!))
        assertNull(blank["decisions"]!!.jsonArray.single().jsonObject["note"])

        val task = CareerModel.applyBody(listOf(CareerDecision.of(CareerKind.TASK, "t1", CareerOp.CREATE, dueDate = "2026-11-18")!!))
        assertEquals("2026-11-18", task["decisions"]!!.jsonArray.single().jsonObject["due_date"]!!.jsonPrimitive.content)
    }

    @Test
    fun `apply body carries every staged decision in one call`() {
        val body = CareerModel.applyBody(
            listOf(
                CareerDecision.of(CareerKind.OFFER, "o1", CareerOp.APPLY)!!,
                CareerDecision.of(CareerKind.FOLLOWUP, "f1", CareerOp.DONE)!!,
            ),
        )
        val decisions = body["decisions"]!!.jsonArray.map { it.jsonObject["op"]!!.jsonPrimitive.content }
        assertEquals(listOf("apply", "done"), decisions)
    }

    @Test
    fun `settled keys are the applied and already decided results`() {
        val body = ProposalJson.parseToJsonElement(
            """{"uid":"new","status":"ready","results":[
                {"kind":"offer","id":"o1","state":"applied"},
                {"kind":"followup","id":"f1","state":"already_decided"},
                {"kind":"task","id":"t1","state":"failed","error":"boom"}
            ]}""",
        ).jsonObject
        assertEquals(setOf("offer:o1", "followup:f1"), CareerModel.settledKeys(body))
    }

    @Test
    fun `tapping stages a choice without any change to the proposal`() {
        val draft = CareerDraft(uid = "new").tap(CareerKind.OFFER, "o1", CareerOp.APPLY, null)
        assertEquals(CareerOp.APPLY, draft.choiceOf(CareerKind.OFFER, "o1")?.op)
        assertEquals(1, draft.size)
        assertEquals(listOf("apply"), draft.decisions().map { it.op.wire })
    }

    @Test
    fun `another tap changes the staged choice and the same tap clears it`() {
        val applied = CareerDraft(uid = "new").tap(CareerKind.OFFER, "o1", CareerOp.APPLY, null)
        val changed = applied.tap(CareerKind.OFFER, "o1", CareerOp.SKIP, null)
        assertEquals(CareerOp.SKIP, changed.choiceOf(CareerKind.OFFER, "o1")?.op)
        assertEquals(1, changed.size)
        assertEquals(0, changed.tap(CareerKind.OFFER, "o1", CareerOp.SKIP, null).size)
    }

    @Test
    fun `a note goes with its staged decision only, trimmed when sent`() {
        val noted = CareerDraft(uid = "new").tap(CareerKind.OFFER, "o1", CareerOp.APPLY, null).withNote(CareerKind.OFFER, "o1", "  Bonne piste  ")
        assertEquals("Bonne piste", noted.decisions().single().note)
        val orphan = CareerDraft(uid = "new").withNote(CareerKind.OFFER, "o2", "Trop loin")
        assertTrue(orphan.decisions().isEmpty())
    }

    @Test
    fun `settled decisions leave the draft and failed ones stay staged`() {
        val draft = CareerDraft(uid = "new")
            .tap(CareerKind.OFFER, "o1", CareerOp.APPLY, null)
            .tap(CareerKind.TASK, "t1", CareerOp.CREATE, "2026-11-18")
            .withNote(CareerKind.TASK, "t1", "Vite")
        val rest = draft.settle(setOf("offer:o1"))
        assertEquals(listOf("t1"), rest.decisions().map { it.id })
        assertEquals("Vite", rest.decisions().single().note)
        assertEquals("2026-11-18", rest.decisions().single().dueDate)
    }

    @Test
    fun `a new proposal resets the draft and clear empties it`() {
        val draft = CareerDraft(uid = "old").tap(CareerKind.OFFER, "o1", CareerOp.APPLY, null)
        assertEquals(0, draft.forProposal("new").size)
        assertEquals(1, draft.forProposal("old").size)
        assertEquals(0, draft.cleared().size)
    }

    @Test
    fun `a later choice is a decision sent with the others`() {
        val draft = CareerDraft(uid = "new").tap(CareerKind.OFFER, "o1", CareerOp.LATER, null)
        assertEquals(listOf("later"), draft.decisions().map { it.op.wire })
    }

    @Test
    fun `a career notification opens the career screen`() {
        assertEquals(ProposalNotifications.ROUTE_CAREER, ProposalNotifications.present("career", "ready")?.route)
        assertEquals(ProposalNotifications.ROUTE_CAREER, ProposalNotifications.present("career", "failed")?.route)
        assertNull(ProposalNotifications.present("career", "pending"))
    }

    @Test
    fun `plus tard laisse l'élément ouvert`() {
        val base = proposals().first { it.uid == "new" }
        val later = base.copy(
            decisions = base.decisions + listOf(
                CareerDecisionDto(kind = "offer", id = "o1", op = "later"),
                CareerDecisionDto(kind = "followup", id = "f1", op = "later"),
                CareerDecisionDto(kind = "task", id = "t1", op = "later"),
            ),
        )
        val view = CareerModel.view(later)
        assertEquals(listOf("f1", "f2"), view.followups.map { it.id })
        assertEquals(listOf("o1"), view.offers.map { it.id })
        assertEquals(listOf("t1"), view.tasks.map { it.id })
        assertEquals(listOf("o2"), view.decided.map { it.id })
    }

    @Test
    fun `notes are trimmed and capped`() {
        assertNull(CareerModel.noteOf("  "))
        assertEquals(CareerModel.NOTE_MAX_LENGTH, CareerModel.noteOf("a".repeat(900))!!.length)
    }
}
