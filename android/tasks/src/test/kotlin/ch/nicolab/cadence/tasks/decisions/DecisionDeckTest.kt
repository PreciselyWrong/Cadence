package ch.nicolab.cadence.tasks.decisions

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class DecisionDeckTest {
    private fun card(uid: String, kind: String, createdAt: String?, recommended: String? = null) = DecisionCardData(
        uid = uid,
        kind = kind,
        kindLabel = kind,
        key = uid,
        title = uid,
        choices = listOf(DecisionChoice("a", "A"), DecisionChoice("b", "B")),
        recommended = recommended,
        createdAt = createdAt,
    )

    @Test
    fun `les cartes sont groupées par type selon leur plus ancienne carte, puis plus ancienne d'abord`() {
        val input = listOf(
            card("f2", "finance", "2026-11-12T10:00:00Z"),
            card("s1", "subscription", "2026-11-10T08:00:00Z"),
            card("f1", "finance", "2026-11-09T09:00:00Z"),
            card("s2", "subscription", "2026-11-11T08:00:00Z"),
        )
        // finance a la plus ancienne carte (2026-11-09), donc finance passe avant subscription.
        val ordered = DecisionDeck.cards(input)
        assertEquals(listOf("f1", "f2", "s1", "s2"), ordered.map { it.uid })
    }

    @Test
    fun `les cartes masquées sortent et les passées passent à la fin`() {
        val input = listOf(
            card("a", "family", "2026-11-10T08:00:00Z"),
            card("b", "family", "2026-11-11T08:00:00Z"),
            card("c", "family", "2026-11-12T08:00:00Z"),
        )
        val ordered = DecisionDeck.cards(input, hidden = setOf("b"), skipped = listOf("a"))
        assertEquals(listOf("c", "a"), ordered.map { it.uid })
    }

    @Test
    fun `recommendedChoice et noteText suivent le contrat`() {
        val withRec = card("a", "family", null, recommended = "b")
        assertEquals("b", DecisionDeck.recommendedChoice(withRec)?.id)
        assertNull(DecisionDeck.recommendedChoice(card("x", "family", null, recommended = null)))

        assertNull(DecisionDeck.noteText("   \n  "))
        assertEquals("Ok", DecisionDeck.noteText("  Ok  "))
        assertEquals(DecisionDeck.NOTE_MAX_LENGTH, DecisionDeck.noteText("x".repeat(600))?.length)
    }

    @Test
    fun `l'avancement reflète les cartes décidées sur le total ouvert`() {
        val p = DecisionDeck.progress(remaining = 6, total = 9)
        assertEquals(3, p.done)
        assertEquals(9, p.total)
    }
}
