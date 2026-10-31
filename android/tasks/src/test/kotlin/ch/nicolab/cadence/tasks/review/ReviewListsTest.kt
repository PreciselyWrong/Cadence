package ch.nicolab.cadence.tasks.review

import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ReviewListsTest {
    private fun served(uid: String, reviewedAt: String? = null) =
        ReviewTask(uid = uid, name = uid, reviewedAt = reviewedAt?.let(Instant::parse))

    @Test
    fun `a decision taken on the phone hides the row until the server answers again`() {
        val items = listOf(served("a"), served("b", "2026-10-01T00:00:00Z"), served("c", "2026-10-01T00:00:00Z"), served("d"))
        val local = mapOf(
            // Décidée ici, pas encore envoyée : l'horodatage local est plus récent que celui servi.
            "a" to TaskItem("a", "a", reviewedAt = Instant.parse("2026-10-31T09:00:00Z")),
            // Déjà connue du serveur : même horodatage, la ligne reste.
            "b" to TaskItem("b", "b", reviewedAt = Instant.parse("2026-10-01T00:00:00Z")),
            "c" to TaskItem("c", "c", reviewedAt = Instant.parse("2026-10-31T09:00:00Z")),
            // Terminée sur le téléphone entre-temps.
            "d" to TaskItem("d", "d", status = TaskStatus.DONE),
        )
        assertEquals(listOf("b"), ReviewLists.pending(items, local).map { it.uid })
    }

    @Test
    fun `a served task unknown to the phone stays listed`() {
        assertEquals(listOf("x"), ReviewLists.pending(listOf(served("x")), emptyMap()).map { it.uid })
    }

    @Test
    fun `the step is restored between sessions, unknown values fall back to the first`() {
        assertEquals(ReviewStep.LATER, ReviewStep.restore("later"))
        assertEquals(ReviewStep.UNDECIDED, ReviewStep.restore(null))
        assertEquals(ReviewStep.UNDECIDED, ReviewStep.restore("nope"))
        assertEquals(ReviewStep.PUSHED, ReviewStep.UNDECIDED.next)
        assertEquals(null, ReviewStep.WEEK.next)
        assertEquals(
            listOf("undecided", "pushed", "projects", "later", "stale", "week"),
            ReviewStep.entries.map { it.wire },
        )
    }

    @Test
    fun `capacity line`() {
        assertEquals("4 h 30 prévues / 6 h disponibles", WeekCapacity.line(270, 360))
        assertEquals("45 min prévues", WeekCapacity.line(45, null))
        assertEquals(true, WeekCapacity.over(400, 360))
        assertEquals(false, WeekCapacity.over(400, null))
    }

    @Test
    fun `this or that keeps the pick and meets the next one`() {
        var duel = ThisOrThat.start(listOf("a", "b", "c", "d"))
        assertEquals("a" to "b", duel.pair)
        duel = duel.pick("b")
        assertEquals("b" to "c", duel.pair)
        duel = duel.neither()
        assertEquals(null, duel.pair)
        assertEquals("d", duel.winner)
        assertEquals("a", ThisOrThat.start(listOf("a")).winner)
        assertEquals(null, ThisOrThat.start(listOf("a", "b")).neither().winner)
    }
}
